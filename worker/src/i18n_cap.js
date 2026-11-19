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
