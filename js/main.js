var canvas = document.getElementById('globe-canvas');
var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);

var scene = new THREE.Scene();
var camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 2.5;

// ===== ЗВЁЗДЫ =====
(function() {
  var geo = new THREE.BufferGeometry();
  var count = 8000;
  var pos = new Float32Array(count * 3);
  for (var i = 0; i < count; i++) {
    var theta = Math.random() * Math.PI * 2;
    var phi = Math.acos(2 * Math.random() - 1);
    var r = 80 + Math.random() * 120;
    pos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
    pos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
    pos[i*3+2] = r * Math.cos(phi);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xffffff, size: 0.13, transparent: true, opacity: 0.9
  })));
})();

// ===== ЗАГРУЗКА ТЕКСТУР =====
var loader = new THREE.TextureLoader();

var earthTex = loader.load(EARTH_DAY);
var bumpTex  = loader.load(EARTH_BUMP);

// Specular грузим с колбэком — размываем после загрузки
var specCanvas = document.createElement('canvas');
specCanvas.width = 512; specCanvas.height = 256;
var specCtx = specCanvas.getContext('2d');
specCtx.fillStyle = '#444'; specCtx.fillRect(0,0,512,256);
var specTex = new THREE.CanvasTexture(specCanvas);

var specImg = new Image();
specImg.onload = function() {
  specCtx.filter = 'blur(8px)';
  specCtx.drawImage(specImg, 0, 0, 512, 256);
  specCtx.filter = 'none';
  specTex.needsUpdate = true;
};
specImg.src = EARTH_SPEC;

// ===== ЗЕМЛЯ =====
var earthGeo = new THREE.SphereGeometry(1, 96, 96);
var earthMat = new THREE.MeshPhongMaterial({
  map:         earthTex,
  bumpMap:     bumpTex,
  bumpScale:   0.06,
  specularMap: specTex,
  specular:    new THREE.Color(0x334455),
  shininess:   12,
});
var earth = new THREE.Mesh(earthGeo, earthMat);
scene.add(earth);

// ===== АТМОСФЕРА =====
// Внутренний слой — голубой ореол
var atmMat = new THREE.MeshPhongMaterial({
  color: 0x4488ff,
  transparent: true,
  opacity: 0.06,
  side: THREE.FrontSide,
  depthWrite: false,
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.02, 64, 64), atmMat));

// Внешний ореол через ShaderMaterial (Fresnel эффект)
var glowMat = new THREE.ShaderMaterial({
  uniforms: {
    c:   { value: 0.5 },
    p:   { value: 4.5 },
    glowColor: { value: new THREE.Color(0x3377ff) },
  },
  vertexShader: [
    'varying float intensity;',
    'void main() {',
    '  vec3 vNormal = normalize(normalMatrix * normal);',
    '  vec3 vNormel = normalize(vec3(modelViewMatrix * vec4(position, 1.0)));',
    '  intensity = pow(0.5 - dot(vNormal, vNormel), 2.0);',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '}'
  ].join('\n'),
  fragmentShader: [
    'uniform vec3 glowColor;',
    'varying float intensity;',
    'void main() {',
    '  vec3 glow = glowColor * intensity;',
    '  gl_FragColor = vec4(glow, intensity * 0.8);',
    '}'
  ].join('\n'),
  side: THREE.BackSide,
  blending: THREE.AdditiveBlending,
  transparent: true,
  depthWrite: false,
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.18, 64, 64), glowMat));

// ===== ОБЛАКА (реальная текстура NASA) =====
var cloudTex = loader.load(EARTH_CLOUDS);
var clouds = new THREE.Mesh(
  new THREE.SphereGeometry(1.008, 64, 64),
  new THREE.MeshPhongMaterial({
    map: cloudTex,
    alphaMap: cloudTex,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  })
);
scene.add(clouds);

// ===== СВЕТ =====
// Фоновый
scene.add(new THREE.AmbientLight(0x111122, 0.5));

// Солнце
var sun = new THREE.DirectionalLight(0xfff8e8, 1.6);
sun.position.set(5, 2, 4);
scene.add(sun);

// Мягкий контр-свет (ночная сторона чуть подсвечена)
var backLight = new THREE.DirectionalLight(0x112244, 0.15);
backLight.position.set(-5, -1, -3);
scene.add(backLight);

// ===== УПРАВЛЕНИЕ =====
var isDragging = false;
var prevMX = 0, prevMY = 0;
var velX = 0, velY = 0.0008;

canvas.addEventListener('contextmenu', function(e) { e.preventDefault(); });
canvas.addEventListener('mousedown', function(e) {
  isDragging = true;
  prevMX = e.clientX; prevMY = e.clientY;
  velX = 0; velY = 0;
  e.preventDefault();
});
window.addEventListener('mousemove', function(e) {
  if (!isDragging) return;
  var dx = e.clientX - prevMX;
  var dy = e.clientY - prevMY;
  velY = dx * 0.005;
  velX = dy * 0.005;
  earth.rotation.y  += velY;
  earth.rotation.x  += velX;
  clouds.rotation.y += velY;
  clouds.rotation.x += velX;
  prevMX = e.clientX; prevMY = e.clientY;
});
window.addEventListener('mouseup', function() { isDragging = false; });
canvas.addEventListener('mouseleave', function() { isDragging = false; });

// ===== АНИМАЦИЯ — запускается после загрузки маркеров =====

// ===== УПРАВЛЕНИЕ ГОДОМ =====
var currentYear = -2500;
var currentStep = 50;
var showEmpires = true;

function updateMarkers() {
  if (!eventMarkers || !eventMarkers.length) return;
  // Запрашиваем через адаптер — сейчас local, потом remote
  DataAPI.getEvents(currentYear - 1, currentYear + 1, function(err, activeEvents) {
    if (err) return;
    var activeIds = {};
    activeEvents.forEach(function(e) { activeIds[e.id] = true; });
    eventMarkers.forEach(function(g) {
      g._targetOpacity = activeIds[g._event.id] ? 1 : 0;
    });
  });
}

function updateYearDisplay() {
  var input = document.getElementById('year-input');
  var era   = document.getElementById('year-era');
  if (currentYear < 0) {
    input.value = Math.abs(currentYear);
    era.textContent = 'до н.э.';
  } else {
    input.value = currentYear;
    era.textContent = 'н.э.';
  }
  updateMarkers();
  updateEmpires();
}

document.getElementById('btn-prev').addEventListener('click', function() {
  currentYear -= currentStep;
  updateYearDisplay();
});

document.getElementById('btn-next').addEventListener('click', function() {
  currentYear += currentStep;
  updateYearDisplay();
});

document.getElementById('year-input').addEventListener('change', function() {
  var val = parseInt(this.value);
  if (isNaN(val)) return;
  var era = document.getElementById('year-era').textContent;
  currentYear = (era === 'до н.э.') ? -Math.abs(val) : Math.abs(val);
  updateYearDisplay();
});

// Клик на эру — переключает до н.э. / н.э.
document.getElementById('year-era').addEventListener('click', function() {
  currentYear = -currentYear;
  updateYearDisplay();
});
document.getElementById('year-era').style.cursor = 'pointer';

updateYearDisplay();

// ===== ИМПЕРИИ =====

var empireMeshes = []; // { mesh, empire }

function hexToRgb(hex) {
  var r = parseInt(hex.slice(1,3),16)/255;
  var g = parseInt(hex.slice(3,5),16)/255;
  var b = parseInt(hex.slice(5,7),16)/255;
  return new THREE.Color(r, g, b);
}

function latLonToVec3Empire(lon, lat, radius) {
  var phi   = (90 - lat) * Math.PI / 180;
  var theta = (lon + 180) * Math.PI / 180;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
     radius * Math.cos(phi),
     radius * Math.sin(phi) * Math.sin(theta)
  );
}

// ===== ПРИВЯЗКА ГРАНИЦ К ПОБЕРЕЖЬЮ =====
// Для каждой точки полигона империи находим ближайшую точку берега
// в радиусе snapRadius (градусы) и подменяем — граница "облизывает" берег

function distSq(a, b) {
  var dx = a[0]-b[0], dy = a[1]-b[1];
  return dx*dx + dy*dy;
}

function findNearestCoastPoint(pt, maxDistDeg) {
  var maxDistSq = maxDistDeg * maxDistDeg;
  var best = null, bestD = maxDistSq;
  for (var i = 0; i < COASTLINE_POINTS.length; i++) {
    var d = distSq(pt, COASTLINE_POINTS[i]);
    if (d < bestD) { bestD = d; best = COASTLINE_POINTS[i]; }
  }
  return best;
}

function snapPolygonToCoast(poly, snapRadius) {
  if (typeof COASTLINE_POINTS === 'undefined') return poly;
  snapRadius = snapRadius || 2.5; // градусов — насколько далеко ищем берег

  var result = [];
  for (var i = 0; i < poly.length; i++) {
    var pt = poly[i];
    var nearest = findNearestCoastPoint(pt, snapRadius);
    if (nearest) {
      // Притягиваем точку немного в сторону берега (не на 100%, чтобы не было резко)
      var t = 0.7; // сила притяжения
      result.push([
        pt[0] + (nearest[0]-pt[0]) * t,
        pt[1] + (nearest[1]-pt[1]) * t
      ]);
    } else {
      result.push(pt);
    }
  }
  return result;
}


function buildEmpirePolygon(poly, color) {
  var group = new THREE.Group();

  var pts3d = poly.map(function(p) {
    return latLonToVec3Empire(p[0], p[1], 1.002);
  });

  var center = new THREE.Vector3(0,0,0);
  pts3d.forEach(function(p) { center.add(p); });
  center.divideScalar(pts3d.length);

  // Заливка
  var geom = new THREE.BufferGeometry();
  var verts = [];
  for (var i = 0; i < pts3d.length; i++) {
    var next = (i + 1) % pts3d.length;
    verts.push(center.x, center.y, center.z);
    verts.push(pts3d[i].x, pts3d[i].y, pts3d[i].z);
    verts.push(pts3d[next].x, pts3d[next].y, pts3d[next].z);
  }
  geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geom.computeVertexNormals();

  var fillMat = new THREE.MeshBasicMaterial({
    color: hexToRgb(color),
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  group.add(new THREE.Mesh(geom, fillMat));

  // Плавный контур — интерполяция по дуге сферы (slerp)
  function slerpPoints(a, b, steps) {
    var pts = [];
    for (var s = 0; s <= steps; s++) {
      var t = s / steps;
      var p = new THREE.Vector3().copy(a).lerp(b, t).normalize()
              .multiplyScalar(1.0015);
      pts.push(p);
    }
    return pts;
  }

  var lineVerts = [];
  for (var j = 0; j < pts3d.length; j++) {
    var p1 = pts3d[j];
    var p2 = pts3d[(j+1) % pts3d.length];
    // Количество шагов зависит от угла между точками
    var angle = p1.angleTo(p2);
    var steps = Math.max(4, Math.round(angle * 30));
    var interp = slerpPoints(p1, p2, steps);
    for (var k = 0; k < interp.length - 1; k++) {
      lineVerts.push(
        interp[k].x,   interp[k].y,   interp[k].z,
        interp[k+1].x, interp[k+1].y, interp[k+1].z
      );
    }
  }
  var lineGeom = new THREE.BufferGeometry();
  lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(lineVerts, 3));
  var lineMat = new THREE.LineBasicMaterial({
    color: 0xff2222,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  group.add(new THREE.LineSegments(lineGeom, lineMat));

  group._fillMat = fillMat;
  group._lineMat = lineMat;
  return group;
}

// Создаём меши для всех фаз всех империй
EMPIRES.forEach(function(empire) {
  empire.phases.forEach(function(phase) {
    var snappedPoly = snapPolygonToCoast(phase.poly, 2.5);
    var group = buildEmpirePolygon(snappedPoly, empire.color);
    group._empire = empire;
    group._phase  = phase;
    group._targetOpacity = 0;
    earth.add(group);
    empireMeshes.push(group);
  });
});

function updateEmpires() {
  if (typeof empireMeshes === 'undefined' || !empireMeshes.length) return;
  if (!showEmpires) {
    empireMeshes.forEach(function(m) { m._targetOpacity = 0; });
    return;
  }
  DataAPI.getEmpires(currentYear - 1, currentYear + 1, function(err, activeEmpires) {
    if (err) return;
    var activeIds = {};
    activeEmpires.forEach(function(emp) {
      emp.phases.forEach(function(p) {
        if (currentYear >= p.yearFrom && currentYear <= p.yearTo) {
          activeIds[emp.id + '_' + p.yearFrom] = true;
        }
      });
    });
    empireMeshes.forEach(function(m) {
      var key = m._empire.id + '_' + m._phase.yearFrom;
      m._targetOpacity = activeIds[key] ? 0.28 : 0;
    });
  });
}

// ===== ИСТОРИЧЕСКИЕ СОБЫТИЯ =====

var eventMarkers = []; // { mesh, event }
var raycaster = new THREE.Raycaster();
var mouse = new THREE.Vector2();

function latLonToVec3(lat, lon, radius) {
  var phi   = (90 - lat) * Math.PI / 180;
  var theta = (lon + 180) * Math.PI / 180;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
     radius * Math.cos(phi),
     radius * Math.sin(phi) * Math.sin(theta)
  );
}

function createMarker(event) {
  // Пульсирующая точка — два меша: ядро + ореол
  var group = new THREE.Group();

  // Ядро
  var core = new THREE.Mesh(
    new THREE.SphereGeometry(0.018, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xffcc33 })
  );
  group.add(core);

  // Ореол
  var glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.032, 12, 12),
    new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.35,
    })
  );
  group.add(glow);

  var pos = latLonToVec3(event.lat, event.lon, 1.01);
  group.position.copy(pos);
  group._event         = event;
  group._glow          = glow;
  group._phase         = Math.random() * Math.PI * 2;
  group._opacity       = 0;
  group._targetOpacity = 0;

  earth.add(group);
  eventMarkers.push(group);
}

// Создаём маркеры
HISTORICAL_EVENTS.forEach(createMarker);

// Пульсация маркеров
var _origAnimate = animate;
function animate() {
  requestAnimationFrame(animate);
  var t = Date.now() * 0.002;

  // Fade империй
  empireMeshes.forEach(function(m) {
    var target = m._targetOpacity;
    var fill = m._fillMat.opacity;
    if (fill < target) {
      m._fillMat.opacity = Math.min(target, fill + 0.02);
    } else if (fill > target) {
      m._fillMat.opacity = Math.max(target, fill - 0.02);
    }
    m._lineMat.opacity = m._fillMat.opacity > 0.01 ? Math.min(1, m._fillMat.opacity * 3) : 0;
  });

  eventMarkers.forEach(function(g) {
    var pulse = 0.5 + 0.5 * Math.sin(t + g._phase);
    g._glow.material.opacity = (0.15 + 0.4 * pulse) * g._opacity;
    var s = 1 + 0.3 * pulse;
    g._glow.scale.set(s, s, s);

    // Плавный fade
    if (g._opacity < g._targetOpacity) {
      g._opacity = Math.min(g._targetOpacity, g._opacity + 0.04);
    } else if (g._opacity > g._targetOpacity) {
      g._opacity = Math.max(g._targetOpacity, g._opacity - 0.04);
    }

    g.children[0].material.opacity = g._opacity; // ядро
    g.children[0].material.transparent = true;
    g.visible = g._opacity > 0.01;
  });

  if (!isDragging) {
    earth.rotation.y  += velY;
    clouds.rotation.y += velY * 1.1;
    velX *= 0.92;
    velY += (0.0008 - velY) * 0.015;
    earth.rotation.x  += velX;
    clouds.rotation.x += velX;
  }
  renderer.render(scene, camera);
}

// Карточка события
function showEventCard(evt) {
  var card  = document.getElementById('event-card');
  var yearEl = document.getElementById('event-year');
  var titleEl = document.getElementById('event-title');
  var descEl  = document.getElementById('event-desc');

  var y = evt.year < 0 ? Math.abs(evt.year) + ' до н.э.' : evt.year + ' н.э.';
  yearEl.textContent  = '~ ' + y;
  titleEl.textContent = evt.title;
  descEl.textContent  = evt.description;

  card.style.display = 'block';
}

document.getElementById('event-close').addEventListener('click', function() {
  document.getElementById('event-card').style.display = 'none';
});

// Клик по глобусу
canvas.addEventListener('click', function(e) {
  if (Math.abs(velY) > 0.005) return; // не открывать при быстром вращении

  mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  var allMeshes = [];
  eventMarkers.forEach(function(g) {
    g.children.forEach(function(m) { allMeshes.push(m); });
  });

  var hits = raycaster.intersectObjects(allMeshes);
  if (hits.length > 0) {
    var group = hits[0].object.parent;
    showEventCard(group._event);
  }
});

// Touch tap для мобильных
var touchStartPos = null;
canvas.addEventListener('touchstart', function(e) {
  if (e.touches.length === 1) {
    touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
}, { passive: true });

canvas.addEventListener('touchend', function(e) {
  if (!touchStartPos || e.changedTouches.length !== 1) return;
  var dx = e.changedTouches[0].clientX - touchStartPos.x;
  var dy = e.changedTouches[0].clientY - touchStartPos.y;
  var dist = Math.sqrt(dx*dx + dy*dy);

  // Считаем тапом если палец почти не двигался
  if (dist < 10) {
    mouse.x =  (e.changedTouches[0].clientX / window.innerWidth)  * 2 - 1;
    mouse.y = -(e.changedTouches[0].clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    var allMeshes = [];
    eventMarkers.forEach(function(g) {
      g.children.forEach(function(m) { allMeshes.push(m); });
    });

    var hits = raycaster.intersectObjects(allMeshes);
    if (hits.length > 0) {
      var group = hits[0].object.parent;
      showEventCard(group._event);
    }
  }
  touchStartPos = null;
});

window.addEventListener('resize', function() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();

// ===== ZOOM (колесо мыши) =====
canvas.addEventListener('wheel', function(e) {
  e.preventDefault();
  camera.position.z += e.deltaY * 0.001;
  camera.position.z = Math.max(1.3, Math.min(6.0, camera.position.z));
}, { passive: false });

// ===== ШАГ ВРЕМЕНИ =====
document.getElementById('step-select').addEventListener('change', function() {
  var val = this.value;
  var customInput = document.getElementById('step-custom');
  if (val === 'custom') {
    customInput.style.display = 'block';
    customInput.focus();
  } else {
    customInput.style.display = 'none';
    currentStep = parseInt(val);
  }
});

document.getElementById('step-custom').addEventListener('change', function() {
  var val = parseInt(this.value);
  if (!isNaN(val) && val > 0) currentStep = val;
});

// ===== АВТОВОСПРОИЗВЕДЕНИЕ =====
var isPlaying = false;
var playInterval = null;

function startPlay() {
  var speed = parseInt(document.getElementById('play-speed-select').value);
  playInterval = setInterval(function() {
    currentYear += currentStep;
    updateYearDisplay();
  }, speed);
}

function stopPlay() {
  clearInterval(playInterval);
  playInterval = null;
}

document.getElementById('btn-play').addEventListener('click', function() {
  isPlaying = !isPlaying;
  if (isPlaying) {
    this.innerHTML = '&#9646;&#9646;'; // пауза
    this.classList.add('playing');
    startPlay();
  } else {
    this.innerHTML = '&#9654;'; // play
    this.classList.remove('playing');
    stopPlay();
  }
});

// При смене скорости во время воспроизведения — перезапускаем
document.getElementById('play-speed-select').addEventListener('change', function() {
  if (isPlaying) {
    stopPlay();
    startPlay();
  }
});

// ===== ЧЕКБОКС ИМПЕРИЙ =====
document.getElementById('show-empires').addEventListener('change', function() {
  showEmpires = this.checked;
  updateEmpires();
});

// ===== TOUCH УПРАВЛЕНИЕ =====
var lastTouch = null;
var lastPinchDist = null;

canvas.addEventListener('touchstart', function(e) {
  e.preventDefault();
  if (e.touches.length === 1) {
    lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    velX = 0; velY = 0;
  } else if (e.touches.length === 2) {
    var dx = e.touches[0].clientX - e.touches[1].clientX;
    var dy = e.touches[0].clientY - e.touches[1].clientY;
    lastPinchDist = Math.sqrt(dx*dx + dy*dy);
  }
}, { passive: false });

canvas.addEventListener('touchmove', function(e) {
  e.preventDefault();
  if (e.touches.length === 1 && lastTouch) {
    var dx = e.touches[0].clientX - lastTouch.x;
    var dy = e.touches[0].clientY - lastTouch.y;
    velY = dx * 0.005;
    velX = dy * 0.005;
    earth.rotation.y  += velY;
    earth.rotation.x  += velX;
    clouds.rotation.y += velY;
    clouds.rotation.x += velX;
    lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  } else if (e.touches.length === 2 && lastPinchDist) {
    var dx = e.touches[0].clientX - e.touches[1].clientX;
    var dy = e.touches[0].clientY - e.touches[1].clientY;
    var dist = Math.sqrt(dx*dx + dy*dy);
    var delta = lastPinchDist - dist;
    camera.position.z += delta * 0.01;
    camera.position.z = Math.max(1.3, Math.min(6.0, camera.position.z));
    lastPinchDist = dist;
  }
}, { passive: false });

canvas.addEventListener('touchend', function(e) {
  if (e.touches.length === 0) lastTouch = null;
  if (e.touches.length < 2) lastPinchDist = null;
});
