// Texts: smaller print run in a time-first order (18.11.2026)
import { T } from './i18n.js';
import './i18n_en.js';   // creates T.en; must run before the lines below add to it
Object.assign(T.de, { capLabel:'Auflage (Flyer) – möglich sind ≈ {max}', capAll:'Volle Menge', capHint:'Weniger eingeben, wenn der Kunde weniger Flyer hat. Kreis und Startpunkt bleiben; der Hauptort zuerst, gekürzt wird zuerst in den Nachbarorten mit den meisten Flyern.',
  capNoCut:'{f} Flyer sind mehr als möglich – es bleibt bei ≈ {max}.', capPlace:'Ort', capFull:'Voll', capPlanned:'Geplant', capTotal:'Gesamt', capTime:'Arbeitszeit', capMain:'Hauptort', capOther:'Sonstige',
  capDropped:'Grau gestrichelt auf der Karte: Straßen, die für die kleinere Auflage nicht verteilt werden.' });
Object.assign(T.ru, { capLabel:'Тираж (флаеры) – можно ≈ {max}', capAll:'Полный объём', capHint:'Введите меньше, если у клиента меньше флаеров. Круг и старт не меняются; главный город в приоритете, сокращается прежде всего в соседних местах с наибольшим числом флаеров.',
  capNoCut:'{f} флаеров больше, чем возможно – остаётся ≈ {max}.', capPlace:'Место', capFull:'Полный', capPlanned:'В плане', capTotal:'Итого', capTime:'Рабочее время', capMain:'Главный город', capOther:'Прочее',
  capDropped:'Серым пунктиром на карте: улицы, которые при меньшем тираже не раздаются.' });
Object.assign(T.en, { capLabel:'Print run (flyers) – possible ≈ {max}', capAll:'Full amount', capHint:'Enter less if the customer has fewer flyers. Circle and start stay; the main town first, cuts start in the nearby places with the most flyers.',
  capNoCut:'{f} flyers is more than possible – it stays at ≈ {max}.', capPlace:'Place', capFull:'Full', capPlanned:'Planned', capTotal:'Total', capTime:'Working time', capMain:'Main town', capOther:'Other',
  capDropped:'Grey dashed on the map: streets not delivered for the smaller print run.' });
Object.assign(T.de, { hrsWalk:'Verteilen + Gehen', hrsRide:'Fahrten', hrsTotal:'Gesamt', hrsTeam:'Team', hrsTarget:'Ziel: {lo} – {hi} (Stunden ± Toleranz, Frist und Schichten berücksichtigt).', hrsVillages:'Dörfer im Kreis dazugenommen: {list}.',
  hrsWhy_all_planned:'Alle Adressen im Kreis sind eingeplant – es bleiben {left} ungenutzt. Mehr Stunden gehen nur mit größerem Kreis oder zusätzlichen Orten.',
  hrsWhy_team_cap:'Bis zur Frist hat das Team nur {cap} (Personen × Stunden × Tage) statt {asked}. Es fehlen {left}.',
  hrsWhy_villages_failed:'Einige Dörfer konnten nicht geladen werden (Kartenserver) – es bleiben {left} ungenutzt. Später neu berechnen.',
  hrsWhy_time_left:'Es bleiben {left} ungenutzt: das nächste Dorf passt mit Anfahrt nicht mehr in die Zeit.',
  hrsRideEst:'Die Straßenkarte für die Fahrten war nicht erreichbar – die Fahrzeiten sind geschätzt (gestrichelt). Bitte prüfen oder eine Fahrzeit pro Fahrt eintragen:',
  hrsRideManual:'Von Hand eingetragen: jede Fahrt zählt so viele Minuten.', hrsRidePh:'Minuten pro Fahrt', hrsRideAuto:'Automatisch' });
Object.assign(T.ru, { hrsWalk:'Раздача + ходьба', hrsRide:'Переезды', hrsTotal:'Итого', hrsTeam:'Команда', hrsTarget:'Цель: {lo} – {hi} (часы ± допуск, с учётом срока и смен).', hrsVillages:'Добавлены деревни в круге: {list}.',
  hrsWhy_all_planned:'Все адреса в круге уже в плане – остаётся {left} без работы. Больше часов – только с бо́льшим кругом или дополнительными местами.',
  hrsWhy_team_cap:'До срока у команды только {cap} (люди × часы × дни) вместо {asked}. Не хватает {left}.',
  hrsWhy_villages_failed:'Некоторые деревни не загрузились (сервер карты) – остаётся {left}. Пересчитайте позже.',
  hrsWhy_time_left:'Остаётся {left}: следующая деревня с дорогой уже не помещается во время.',
  hrsRideEst:'Карта дорог для переездов недоступна – время поездок оценено (пунктир). Проверьте или введите время на одну поездку:',
  hrsRideManual:'Введено вручную: каждая поездка считается столько минут.', hrsRidePh:'Минут на поездку', hrsRideAuto:'Автоматически' });
Object.assign(T.en, { hrsWalk:'Handing out + walking', hrsRide:'Rides', hrsTotal:'Total', hrsTeam:'Team', hrsTarget:'Target: {lo} – {hi} (hours ± tolerance, deadline and shifts considered).', hrsVillages:'Villages in the circle added: {list}.',
  hrsWhy_all_planned:'Every address in the circle is planned – {left} stay unused. More hours only with a bigger circle or extra places.',
  hrsWhy_team_cap:'Until the deadline the team has only {cap} (people × hours × days) instead of {asked}. {left} missing.',
  hrsWhy_villages_failed:'Some villages could not be loaded (map server) – {left} unused. Recalculate later.',
  hrsWhy_time_left:'{left} unused: the next village with its ride no longer fits.',
  hrsRideEst:'The road map for the rides could not be reached – ride times are estimated (dashed). Please check or enter a time per ride:',
  hrsRideManual:'Entered by hand: every ride counts this many minutes.', hrsRidePh:'Minutes per ride', hrsRideAuto:'Automatic' });
Object.assign(T.de, { dfMin:'Max. Fahrzeit vom Start (Min.)', dfFly:'Max. Flyer', dfNone:'ohne Grenze', dfHint:'Das Gebiet wächst nach Autofahrzeit vom Start: erst alle Straßen bis 1 Min., dann 2 Min. usw. – Hauptort, Nachbarorte und von Hand hinzugefügte Orte gleich. Alle drei Grenzen (Fahrzeit, Stunden inkl. Fahrten, Flyer) sind Höchstwerte; die erste stoppt.',
  dfRideOpt:'Fahrzeit selbst festlegen (optional)', dfRideAuto:'leer = automatisch', dfRideHint:'Leer lassen: FlyerMap berechnet jede Fahrt über echte Straßen. Nur ausfüllen, wenn jede Fahrt pauschal so viele Minuten dauern soll (z. B. Bus).', dfOutl:'Ausreißer (Einzelhöfe) überspringen', dfOutM:'Sackgasse ab (m)', dfOutK:'mit weniger als … Briefkästen pro km',
  dfFull:'Vollständig bis {min} Min. Fahrzeit', dfNext:'{min}. Min.: {pct} % verteilt', dfMax:'Höchstens {h} (alle Mitarbeiter, inkl. Fahrten).',
  dfStop_hours:'Gestoppt durch: Stunden ({h}). Frei: {left}.', dfStop_team:'Gestoppt durch: Schichten bis zur Frist ({cap}). Frei: {left}.', dfStop_flyers:'Gestoppt durch: Flyer ({f}).', dfStop_drive:'Gestoppt durch: Fahrzeit ({min} Min.) – alle Adressen bis dahin eingeplant. Frei: {left}.', dfStop_all:'Alle erreichbaren Adressen eingeplant. Frei: {left}.',
  dfNoRoads:'Straßenkarte für die Fahrzeiten nicht erreichbar – geschätzt (40 km/h Luftlinie). Später neu berechnen.', dfSkipped:'{mb} Briefkästen als Ausreißer übersprungen (Sackgasse ab {m} m, unter {k} pro km).' });
Object.assign(T.ru, { dfMin:'Макс. время езды от старта (мин)', dfFly:'Макс. флаеров', dfNone:'без ограничения', dfHint:'Территория растёт по времени езды от старта: сначала все улицы до 1 мин, потом 2 мин и т. д. – главный город, соседние и добавленные вручную места одинаково. Все три границы (время езды, часы с переездами, флаеры) – максимумы; останавливает первая.',
  dfRideOpt:'Задать время переезда вручную (необязательно)', dfRideAuto:'пусто = автоматически', dfRideHint:'Оставьте пустым: FlyerMap считает каждый переезд по реальным дорогам. Заполняйте, только если каждый переезд должен считаться ровно столько минут (например, автобус).', dfOutl:'Пропускать удалённые дома (хутора)', dfOutM:'Тупик от (м)', dfOutK:'меньше … ящиков на км',
  dfFull:'Полностью до {min} мин езды', dfNext:'{min}-я мин: роздано {pct} %', dfMax:'Не больше {h} (все сотрудники, с переездами).',
  dfStop_hours:'Остановлено: часы ({h}). Свободно: {left}.', dfStop_team:'Остановлено: смены до срока ({cap}). Свободно: {left}.', dfStop_flyers:'Остановлено: флаеры ({f}).', dfStop_drive:'Остановлено: время езды ({min} мин) – все адреса до него в плане. Свободно: {left}.', dfStop_all:'Все доступные адреса в плане. Свободно: {left}.',
  dfNoRoads:'Карта дорог для времени езды недоступна – оценка (40 км/ч по прямой). Пересчитайте позже.', dfSkipped:'{mb} ящиков пропущено как удалённые (тупик от {m} м, меньше {k} на км).' });
Object.assign(T.en, { dfMin:'Max. drive time from start (min)', dfFly:'Max. flyers', dfNone:'no limit', dfHint:'The area grows by drive time from the start: all streets up to 1 min, then 2 min … – main town, neighbouring and hand-added places alike. All three limits (drive time, hours incl. rides, flyers) are maxima; the first one stops.',
  dfRideOpt:'Set ride time yourself (optional)', dfRideAuto:'empty = automatic', dfRideHint:'Leave empty: FlyerMap calculates every ride over real roads. Only fill in if every ride should count as a flat number of minutes (e.g. bus).', dfOutl:'Skip outliers (single farms)', dfOutM:'Dead end from (m)', dfOutK:'with fewer than … mailboxes per km',
  dfFull:'Complete up to {min} min drive', dfNext:'Minute {min}: {pct} % covered', dfMax:'At most {h} (all workers, incl. rides).',
  dfStop_hours:'Stopped by: hours ({h}). Free: {left}.', dfStop_team:'Stopped by: shifts until the deadline ({cap}). Free: {left}.', dfStop_flyers:'Stopped by: flyers ({f}).', dfStop_drive:'Stopped by: drive time ({min} min) – every address up to it planned. Free: {left}.', dfStop_all:'Every reachable address planned. Free: {left}.',
  dfNoRoads:'Road map for drive times not reachable – estimated (40 km/h straight line). Recalculate later.', dfSkipped:'{mb} mailboxes skipped as outliers (dead end from {m} m, under {k} per km).' });

Object.assign(T.de, { driveZone:'Warte auf Straßendaten…', loadingVillages:'Lade Orte in Reichweite…', rides:'Berechne Fahrten zwischen Orten…', checkingLimits:'Prüfe Zeit- und Flyergrenzen…', planElapsed:'{n} s' });

Object.assign(T.ru, { driveZone:'Жду данные о дорогах…', loadingVillages:'Загружаю ближайшие населённые пункты…', rides:'Рассчитываю переезды между населёнными пунктами…', checkingLimits:'Проверяю лимиты времени и флаеров…', planElapsed:'{n} с' });

Object.assign(T.en, { driveZone:'Waiting for road data…', loadingVillages:'Loading places within reach…', rides:'Calculating drives between places…', checkingLimits:'Checking time and flyer limits…', planElapsed:'{n} s' });

Object.assign(T.de, {
  budgetModeLabel:'Fortbewegung', budgetModeLegacy:'Bisherige Einstellung', budgetModeWalk:'Zu Fuß', budgetModeCar:'Auto verfügbar',
  walkMax:'Höchstens {h} für alle Mitarbeiter.', walkStop_all:'Alle erreichbaren Adressen eingeplant. Frei: {left}.',
  walkStop_hours:'Gestoppt durch die Arbeitszeit. Frei: {left}.', walkStop_flyers:'Gestoppt durch das Flyerlimit ({f}).'
});
Object.assign(T.ru, {
  budgetModeLabel:'Способ передвижения', budgetModeLegacy:'Прежняя настройка', budgetModeWalk:'Пешком', budgetModeCar:'Машина доступна',
  walkMax:'Не больше {h} на всех сотрудников.', walkStop_all:'Все доступные адреса в плане. Осталось: {left}.',
  walkStop_hours:'Достигнут лимит рабочего времени. Осталось: {left}.', walkStop_flyers:'План ограничен тиражом ({f}).'
});
Object.assign(T.en, {
  budgetModeLabel:'Travel mode', budgetModeLegacy:'Previous setting', budgetModeWalk:'On foot', budgetModeCar:'Car available',
  walkMax:'At most {h} for all workers.', walkStop_all:'All reachable addresses are planned. Time left: {left}.',
  walkStop_hours:'Limited by work hours. Time left: {left}.', walkStop_flyers:'Limited by the flyer count ({f}).'
});

Object.assign(T.de, {
  budgetModeAuto:'Automatisch', budgetAutoHint:'Nahe Straßen zu Fuß. Für weiter entfernte Bereiche wird ein Auto eingeplant, wenn es Zeit spart. Die maximale Fahrzeit begrenzt den Bereich für Autofahrten.',
  budgetAutoWalk:'Automatisch: Dieser Auftrag ist zu Fuß möglich.', budgetAutoMixed:'Automatisch: {n} Autofahrt(en) eingeplant.'
});
Object.assign(T.ru, {
  budgetModeAuto:'Автоматически', budgetAutoHint:'Ближайшие улицы планируются пешком. Для дальних районов машина используется, если экономит время. Лимит езды ограничивает зону автопереездов.',
  budgetAutoWalk:'Автоматически: этот заказ можно выполнить пешком.', budgetAutoMixed:'Автоматически: запланировано автопереездов — {n}.'
});
Object.assign(T.en, {
  budgetModeAuto:'Automatic', budgetAutoHint:'Walk the nearby streets. Use a car for farther areas when it saves time. The drive-time limit applies to the area reached by car.',
  budgetAutoWalk:'Automatic: this order can be completed on foot.', budgetAutoMixed:'Automatic: {n} car trip(s) planned.'
});
