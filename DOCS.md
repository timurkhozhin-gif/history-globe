# Исторический глобус — документация проекта

## Структура файлов

```
webproject/
├── index.html              — точка входа
├── css/
│   └── styles.css          — все стили
├── images/
│   ├── earth_day.jpg       — спутниковая текстура NASA (4K)
│   ├── earth_bump.jpg      — карта рельефа
│   └── earth_spec.jpg      — карта блеска (океан/суша)
└── js/
    ├── libs/
    │   └── three.min.js    — Three.js r128 (локальная копия)
    ├── textures.js         — текстуры закодированы в base64 (без CORS)
    ├── geodata.js          — полигоны суши (127 полигонов, Natural Earth)
    ├── geodetail.js        — реки, озёра, ледники (Natural Earth)
    ├── coastline.js        — точки береговой линии для snap-функции (5091 точка)
    ├── events.js           — исторические события (данные)
    ├── empires.js          — империи и их фазы (данные)
    ├── api.js              — адаптер данных (local / remote)
    └── main.js             — Three.js рендер, логика, анимация
```

---

## Как добавить историческое событие

Открыть `js/events.js` и добавить объект в массив `HISTORICAL_EVENTS`:

```javascript
{
  id: 6,                        // уникальный номер
  year: -776,                   // год события (отрицательное = до н.э.)
  yearFrom: -900,               // начало диапазона отображения
  yearTo:   -600,               // конец диапазона отображения
  title: 'Первые Олимпийские игры',
  description: 'В Олимпии проводятся первые...',
  lat: 37.6384,                 // широта (градусы)
  lon: 21.6277,                 // долгота (градусы)
  category: 'culture'           // architecture | politics | civilization | culture | war
}
```

> **Совет по диапазону:** для древних событий (до 1000 н.э.) ставь ±300 лет,
> для средних веков ±100 лет, для новейшей истории ±25 лет.

---

## Как добавить империю

Открыть `js/empires.js` и добавить объект в массив `EMPIRES`:

```javascript
{
  id: 'rome',                   // уникальный строковый id
  name: 'Римская империя',
  color: '#cc4422',             // цвет заливки полигона (HEX)
  phases: [
    {
      yearFrom: -509,           // начало фазы
      yearTo:   -27,            // конец фазы
      poly: [                   // полигон территории [[lon, lat], ...]
        [12.5, 41.9],
        [15.0, 40.0],
        // ...
      ]
    },
    {
      yearFrom: -27,
      yearTo:   476,
      poly: [ /* расширенная территория */ ]
    }
  ]
}
```

> **Совет по полигонам:** координаты в градусах [lon, lat].
> Точки полигона автоматически притягиваются к береговой линии
> (функция `snapPolygonToCoast` в `main.js`, радиус 2.5°).

---

## Переход на backend

Сейчас проект работает полностью в браузере (`API_MODE = 'local'`).
Все данные хранятся в JS-файлах. При 1000+ событиях или добавлении
поиска/авторизации потребуется backend.

### Шаг 1 — Поднять API

Минимальный стек: **Node.js + Express + SQLite**

Эндпоинты которые нужно реализовать:

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/events?yearFrom=&yearTo=` | события за период |
| GET | `/api/events/search?q=` | поиск по тексту |
| GET | `/api/events/:id` | одно событие |
| GET | `/api/empires?yearFrom=&yearTo=` | империи за период |

Формат ответа — тот же JSON что сейчас в `events.js` и `empires.js`.

### Шаг 2 — Переключить адаптер

В файле `js/api.js` изменить одну строку:

```javascript
// было
var API_MODE = 'local';

// стало
var API_MODE = 'remote';
```

И указать URL сервера:

```javascript
var API_BASE_URL = 'https://your-server.com/api';
```

Больше ничего менять не нужно — `main.js` работает через `DataAPI`
и не знает откуда приходят данные.

### Шаг 3 — Перенести данные в БД

Структура таблицы `events`:

```sql
CREATE TABLE events (
  id          INTEGER PRIMARY KEY,
  year        INTEGER,
  year_from   INTEGER,
  year_to     INTEGER,
  title       TEXT,
  description TEXT,
  lat         REAL,
  lon         REAL,
  category    TEXT
);
```

Структура таблицы `empires` и `empire_phases`:

```sql
CREATE TABLE empires (
  id    TEXT PRIMARY KEY,
  name  TEXT,
  color TEXT
);

CREATE TABLE empire_phases (
  id         INTEGER PRIMARY KEY,
  empire_id  TEXT REFERENCES empires(id),
  year_from  INTEGER,
  year_to    INTEGER,
  poly       TEXT    -- JSON массив [[lon,lat],...]
);
```

---

## Добавить поиск (UI)

Поиск уже реализован в `DataAPI.searchEvents(query, callback)`.
Нужно только добавить поле ввода в `index.html` и вызвать функцию:

```javascript
DataAPI.searchEvents('пирамида', function(err, results) {
  // results — массив событий
  // показать маркеры, подсветить результаты
});
```

---

## Известные ограничения

- `linewidth` в Three.js WebGL на Windows всегда = 1px (ограничение WebGL).
  Для толстых линий нужен `MeshLine` или кастомный шейдер.
- Текстуры зашиты в base64 в `textures.js` — это сделано намеренно
  чтобы работало при открытии через `file://` без сервера.
  При переходе на backend лучше отдавать их как статику.
- Полигоны империй триангулируются веером от центра — для очень
  вогнутых полигонов могут быть артефакты. Решение: библиотека earcut.js.

---

## Зависимости

| Библиотека | Версия | Откуда |
|-----------|--------|--------|
| Three.js | r128 | npm → локально |
| Natural Earth | 50m/110m | github.com/nvkelso/natural-earth-vector |
| NASA Blue Marble | 2004-12 | turban/webgl-earth |

---

## Деплой на сервер

## Деплой на сервер

### Текущая конфигурация

| Параметр | Значение |
|---------|---------|
| Хостинг | koara.io |
| ОС | Ubuntu 24.04 |
| IP | 108.165.174.59 |
| Домен | 94262.koara.live |
| Веб-сервер | Nginx |
| HTTPS | Let's Encrypt (автообновление каждые 90 дней) |
| Файлы сайта | `/var/www/globe/` |
| Конфиг Nginx | `/etc/nginx/sites-available/globe` |
| Репозиторий | https://github.com/timurkhozhin-gif/history-globe |

### Как обновить сайт

**Шаг 1 — на своём компьютере** (после изменений в VS Code):
```bash
git add .
git commit -m "описание что изменилось"
git push
```

**Шаг 2 — на сервере** (в PuTTY, подключиться как root):
```bash
cd /var/www/globe
git pull
```

Готово! Сайт обновлён.

> **Важно:** токен GitHub нужно вводить при каждом `git pull` на сервере.
> Чтобы сохранить токен навсегда, выполни один раз:
> ```bash
> git config --global credential.helper store
> ```
> После этого введи логин и токен один раз — и они запомнятся.

### Nginx конфиг

```nginx
server {
    listen 80;
    server_name 94262.koara.live 108.165.174.59;
    root /var/www/globe;
    index index.html;
    location / {
        try_files $uri $uri/ =404;
    }
}
```

HTTPS конфиг добавляется автоматически Certbot'ом.

### Полезные команды на сервере

```bash
systemctl status nginx       # статус веб-сервера
systemctl restart nginx      # перезапустить веб-сервер
nginx -t                     # проверить конфиг на ошибки
certbot renew                # обновить SSL сертификат вручную
```

