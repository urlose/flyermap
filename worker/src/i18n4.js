// Design system v1: theme, statuses, GPS states, order wizard, settings
import { T } from './i18n.js';
Object.assign(T.de, {
  theme:'Darstellung', theme_system:'System', theme_light:'Hell', theme_dark:'Dunkel',
  offlineBanner:'Keine Internetverbindung. Gelaufene Strecke wird gespeichert und später gesendet.',
  stLive:'Unterwegs', stPlanned:'Geplant', stNoWorkers:'Ohne Mitarbeiter', stDoneTask:'Abgeschlossen',
  kTotal:'Gesamt', kNew:'Neu', mapOrders:'Aufträge', mapOrdersN:'Offene Aufträge ({n})', accountSettings:'Konto & Einstellungen', account:'Konto', loadingShort:'Wird geladen …',
  staleData:'Keine Verbindung · Stand {x}', netErr:'Keine Verbindung. Bitte später erneut versuchen.',
  wzStart:'Start', wzRoute:'Route', wzTime:'Zeitraum', wzTeam:'Team', wzReview:'Überblick', next:'Weiter',
  startPoint:'Startpunkt', panel:'Panel', dayShort:'Tag',
  assignHint:'Wähle für jede Route einen Mitarbeiter. Du kannst das auch später im Auftrag ändern.', assignedN:'{a} von {n} zugeteilt',
  gps_wait:'GPS wird gesucht …', gps_ok:'GPS ±{m} m', gps_weak:'GPS ungenau (±{m} m)', gps_stale:'GPS veraltet', gps_denied:'Kein Standortzugriff', gps_off:'Standort ist aus',
});
Object.assign(T.ru, {
  theme:'Оформление', theme_system:'Системная', theme_light:'Светлая', theme_dark:'Тёмная',
  offlineBanner:'Нет интернета. Пройденный путь сохраняется и будет отправлен позже.',
  stLive:'В пути', stPlanned:'Запланирован', stNoWorkers:'Без работников', stDoneTask:'Завершён',
  kTotal:'Всего', kNew:'Новые', mapOrders:'Заказы', mapOrdersN:'Открытые заказы ({n})', accountSettings:'Аккаунт и настройки', account:'Аккаунт', loadingShort:'Загрузка…',
  staleData:'Нет связи · данные на {x}', netErr:'Нет связи. Попробуйте позже.',
  wzStart:'Старт', wzRoute:'Маршрут', wzTime:'Сроки', wzTeam:'Команда', wzReview:'Обзор', next:'Далее',
  startPoint:'Точка старта', panel:'Панель', dayShort:'день',
  assignHint:'Выберите работника для каждого маршрута. Это можно изменить и позже в заказе.', assignedN:'назначено {a} из {n}',
  gps_wait:'Поиск GPS…', gps_ok:'GPS ±{m} м', gps_weak:'GPS неточный (±{m} м)', gps_stale:'GPS устарел', gps_denied:'Нет доступа к геопозиции', gps_off:'Геолокация выключена',
});
