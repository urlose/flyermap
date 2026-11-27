// UI redesign, part 2 (16.11.2026): collapsible sidebar, tab badges, sections on order and worker pages, wizard help, saving
import { T } from './i18n.js';
Object.assign(T.de, {
  routesN:'{n} Routen',
  verNew:'Neue Version – laden', verNewTip:'{v} ist da. Tippen zum Laden.',
  sbOpen:'Menü ausklappen', sbClose:'Menü einklappen',
  bdHelp:'{n} offene Hilfeanfragen', bdLate:'{n} Termine nach der Frist freigeben', bdRep:'{n} gemeldete Stücke entscheiden',
  secIndex:'Abschnitte', secOverview:'Überblick', secData:'Daten', secMap:'Karte', secMapLong:'Karte und Gebiet', secRoutes:'Routen', secTeam:'Mitarbeiter', secDates:'Termine', secReports:'Meldungen', secOrders:'Aufträge',
  ovRoutesDone:'Routen erledigt', ovAllAssigned:'alle Routen vergeben', ovToDecide:'warten auf deine Entscheidung', ovNothing:'nichts offen',
  teamNone:'Noch niemand eingeteilt.', datesOpen:'noch keine Tage gewählt', datesNoWorker:'ohne Mitarbeiter', repLateHint:'{n} Route(n): Tage nach der Frist – oben bei der Route freigeben oder ablehnen.',
  repDecide:'Auf der Routenkarte entscheiden', repNone:'Keine Meldungen.', wOrdersNone:'Noch keine Aufträge.',
  rvChange:'Ändern', rvIntro:'Bitte prüfen. Mit „Ändern“ springst du zum Schritt; nichts geht verloren.',
  wzStepOf:'Schritt {n} von {of}',
  wzDesc1:'Name des Auftrags, Startadresse und – falls gewünscht – weitere Orte oder selbst gezeichnete Gebiete.',
  wzDesc2:'Bis wann verteilt sein muss und wie viele Stunden pro Tag. Davon hängt ab, wie viele Tage der Plan hat.',
  wzDesc3:'Flyer und Personen. Die Route wird berechnet; reichen die Briefkästen nicht, siehst du Vorschläge.',
  wzDesc4:'Wer welche Route bekommt. Leer lassen geht – dann ist die Route noch frei.',
  wzDesc5:'Alles noch einmal ansehen und speichern.',
  wzNeedStart:'Zuerst eine Startadresse eingeben oder auf der Karte setzen.', wzCalc:'Die Route wird noch berechnet – einen Moment.', wzFix:'Bitte die markierten Angaben prüfen.',
  saving:'Speichert …', notSaved:'Nicht gespeichert – bitte erneut versuchen.',
});
Object.assign(T.ru, {
  routesN:'маршрутов: {n}',
  verNew:'Новая версия — обновить', verNewTip:'Вышла {v}. Нажми, чтобы загрузить.',
  sbOpen:'Развернуть меню', sbClose:'Свернуть меню',
  bdHelp:'Открытых обращений: {n}', bdLate:'Даты после срока ждут решения: {n}', bdRep:'Отмеченные участки ждут решения: {n}',
  secIndex:'Разделы', secOverview:'Обзор', secData:'Данные', secMap:'Карта', secMapLong:'Карта и район', secRoutes:'Маршруты', secTeam:'Работники', secDates:'Сроки', secReports:'Сообщения', secOrders:'Заказы',
  ovRoutesDone:'маршрутов выполнено', ovAllAssigned:'все маршруты розданы', ovToDecide:'ждут твоего решения', ovNothing:'ничего не ждёт',
  teamNone:'Пока никто не назначен.', datesOpen:'дни ещё не выбраны', datesNoWorker:'без работника', repLateHint:'Маршрутов с днями после срока: {n} — одобрить или отклонить выше у маршрута.',
  repDecide:'Решить на карте маршрутов', repNone:'Сообщений нет.', wOrdersNone:'Заказов пока нет.',
  rvChange:'Изменить', rvIntro:'Проверь всё. «Изменить» откроет нужный шаг, ничего не потеряется.',
  wzStepOf:'Шаг {n} из {of}',
  wzDesc1:'Название заказа, адрес старта и при желании другие места или нарисованные районы.',
  wzDesc2:'До какого дня всё разнести и сколько часов в день. От этого зависит, на сколько дней план.',
  wzDesc3:'Флаеры и люди. Маршрут считается; если ящиков мало, появятся предложения мест.',
  wzDesc4:'Кто какой маршрут получает. Можно оставить пустым — маршрут останется свободным.',
  wzDesc5:'Ещё раз всё посмотреть и сохранить.',
  wzNeedStart:'Сначала введи адрес старта или поставь точку на карте.', wzCalc:'Маршрут ещё считается — минутку.', wzFix:'Проверь отмеченные поля.',
  saving:'Сохраняю …', notSaved:'Не сохранено — попробуй ещё раз.',
});
Object.assign(T.en, {
  routesN:'{n} routes',
  verNew:'New version – reload', verNewTip:'{v} is out. Tap to load it.',
  sbOpen:'Expand menu', sbClose:'Collapse menu',
  bdHelp:'{n} open help requests', bdLate:'{n} dates after the deadline to approve', bdRep:'{n} reported pieces to decide',
  secIndex:'Sections', secOverview:'Overview', secData:'Details', secMap:'Map', secMapLong:'Map and area', secRoutes:'Routes', secTeam:'Team', secDates:'Dates', secReports:'Reports', secOrders:'Orders',
  ovRoutesDone:'routes finished', ovAllAssigned:'all routes assigned', ovToDecide:'waiting for your decision', ovNothing:'nothing open',
  teamNone:'Nobody assigned yet.', datesOpen:'no days picked yet', datesNoWorker:'no distributor', repLateHint:'{n} route(s) with days after the deadline – approve or decline at the route above.',
  repDecide:'Decide on the route map', repNone:'No reports.', wOrdersNone:'No orders yet.',
  rvChange:'Change', rvIntro:'Please check. “Change” jumps to that step; nothing is lost.',
  wzStepOf:'Step {n} of {of}',
  wzDesc1:'Order name, start address and – if wanted – more places or areas you draw.',
  wzDesc2:'By when everything must be delivered and how many hours per day. This decides how many days the plan has.',
  wzDesc3:'Flyers and people. The route is calculated; if mailboxes are short you see suggestions.',
  wzDesc4:'Who gets which route. Leaving it empty is fine – the route stays free.',
  wzDesc5:'Look at everything once more and save.',
  wzNeedStart:'First enter a start address or set it on the map.', wzCalc:'The route is still being calculated – one moment.', wzFix:'Please check the marked fields.',
  saving:'Saving …', notSaved:'Not saved – please try again.',
});
// order map (27.11.2026): today's hours, pause and pace of every worker, live
Object.assign(T.de, { lgToday:'heute {h} Std.', lgPause:'Pause {h}', lgPace:'Tempo {p} %', paceSlow:'langsam', paceOk:'normal', paceFast:'schnell', paceTooFast:'zu schnell?', lgLiveNow:'läuft', lgDoneToday:'Feierabend', lgNow30:'letzte 30 Min.: {s}' });
Object.assign(T.ru, { lgToday:'сегодня {h} ч', lgPause:'пауза {h}', lgPace:'темп {p} %', paceSlow:'медленно', paceOk:'нормально', paceFast:'быстро', paceTooFast:'слишком быстро?', lgLiveNow:'идёт', lgDoneToday:'закончил', lgNow30:'последние 30 мин: {s}' });
Object.assign(T.en, { lgToday:'today {h} h', lgPause:'break {h}', lgPace:'pace {p} %', paceSlow:'slow', paceOk:'normal', paceFast:'fast', paceTooFast:'too fast?', lgLiveNow:'walking', lgDoneToday:'finished', lgNow30:'last 30 min: {s}' });
// help inbox (27.11.2026): reported pieces and dates after the deadline on top
Object.assign(T.de, { inbDecide:'Zu entscheiden', inbHelp:'Hilfeanfragen' });
Object.assign(T.ru, { inbDecide:'Ждут решения', inbHelp:'Обращения за помощью' });
Object.assign(T.en, { inbDecide:'To decide', inbHelp:'Help requests' });
// route maps (27.11.2026): one switch for everything driven
Object.assign(T.de, { tripsAll:'Autofahrten' });
Object.assign(T.ru, { tripsAll:'Поездки на машине' });
Object.assign(T.en, { tripsAll:'Car rides' });
// removed checkpoints (27.11.2026): not on the maps any more, listed on the order page to take them back
Object.assign(T.de, { rmListTitle:'Checkpoint {n} entfernt', rmBoxes:'Briefkästen' });
Object.assign(T.ru, { rmListTitle:'Чекпоинт {n} удалён', rmBoxes:'ящиков' });
Object.assign(T.en, { rmListTitle:'Checkpoint {n} removed', rmBoxes:'mailboxes' });
