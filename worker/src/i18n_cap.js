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
