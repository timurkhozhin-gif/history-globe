// ===== API АДАПТЕР =====
// Сейчас читает из локальных JS-массивов.
// Для перехода на backend — меняем только этот файл,
// остальной код не трогаем.

var API_MODE = 'remote'; // 'local' | 'remote'
var API_BASE_URL = '/api'; // URL backend когда будет

var DataAPI = {

  // Загрузить события для диапазона лет
  getEvents: function(yearFrom, yearTo, callback) {
    if (API_MODE === 'remote') {
      fetch(API_BASE_URL + '/events?yearFrom=' + yearFrom + '&yearTo=' + yearTo)
        .then(function(r) { return r.json(); })
        .then(function(data) { callback(null, data); })
        .catch(function(err) { callback(err, []); });
      return;
    }
    // local
    var result = HISTORICAL_EVENTS.filter(function(e) {
      return e.yearTo >= yearFrom && e.yearFrom <= yearTo;
    });
    callback(null, result);
  },

  // Загрузить империи для диапазона лет
  getEmpires: function(yearFrom, yearTo, callback) {
    if (API_MODE === 'remote') {
      fetch(API_BASE_URL + '/empires?yearFrom=' + yearFrom + '&yearTo=' + yearTo)
        .then(function(r) { return r.json(); })
        .then(function(data) { callback(null, data); })
        .catch(function(err) { callback(err, []); });
      return;
    }
    // local — возвращаем империи у которых есть хоть одна активная фаза
    var result = EMPIRES.filter(function(emp) {
      return emp.phases.some(function(p) {
        return p.yearTo >= yearFrom && p.yearFrom <= yearTo;
      });
    });
    callback(null, result);
  },

  // Поиск событий по тексту
  searchEvents: function(query, callback) {
    if (API_MODE === 'remote') {
      fetch(API_BASE_URL + '/events/search?q=' + encodeURIComponent(query))
        .then(function(r) { return r.json(); })
        .then(function(data) { callback(null, data); })
        .catch(function(err) { callback(err, []); });
      return;
    }
    // local — простой поиск по названию и описанию
    var q = query.toLowerCase();
    var result = HISTORICAL_EVENTS.filter(function(e) {
      return e.title.toLowerCase().indexOf(q) !== -1 ||
             e.description.toLowerCase().indexOf(q) !== -1;
    });
    callback(null, result);
  },

  // Загрузить одно событие по id
  getEventById: function(id, callback) {
    if (API_MODE === 'remote') {
      fetch(API_BASE_URL + '/events/' + id)
        .then(function(r) { return r.json(); })
        .then(function(data) { callback(null, data); })
        .catch(function(err) { callback(err, null); });
      return;
    }
    var result = HISTORICAL_EVENTS.find(function(e) { return e.id === id; }) || null;
    callback(null, result);
  },

};
