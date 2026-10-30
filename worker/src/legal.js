// Legal texts of the app: privacy policy (Datenschutzerklärung) and provider identification (Impressum / Anbieterkennzeichnung).
// One source for the in-app screens and for the hosted pages (privacy.html / impressum.html, built by scripts/legal-pages.mjs;
// the stores need a public privacy URL). Pure data + HTML strings, no DOM.
//
// Roles: every company that uses FlyerMap is the controller for its distributors' data (it assigns the work and sees the
// GPS data). Its details are entered at company registration and shown here (LEGAL_CTX.firm). The provider of the software
// is the company's processor (AVV, Art. 28 GDPR): PROVIDER below.
// >>> Fill in PROVIDER before going live (placeholders in [brackets] are shown as such / hide the Impressum).

export const PROVIDER = {
  name:'[Name des Anbieters]',
  street:'[Straße und Hausnummer]',
  city:'[PLZ Ort]',
  country:'Deutschland',
  email:'[E-Mail]',
  phone:'',
  vatId:'',
};
export const OPERATOR = PROVIDER;   // old name, kept for imports
// the company of the person looking at the text (set by the app once known)
export const LEGAL_CTX = { firm:null };
export const setLegalFirm = f => { LEGAL_CTX.firm = f && isSet(f.name) ? f : null; };
// closed beta: no public offer, so no Impressum yet. It appears (in the app and as impressum.html) once the provider address is filled in.
const isSet = v => !!v && !/^\[/.test(String(v).trim());
export const IMPRINT_READY = isSet(PROVIDER.street) && isSet(PROVIDER.city);
export const PRIVACY_VERSION = '2026-10-30c';      // bump when the text changes in substance: workers then see the location note again
export const PRIVACY_DATE = { de:'30. Oktober 2026', ru:'30 октября 2026', en:'30 October 2026' };
export const RETENTION = { trackMonths:6, positionHours:12, inboxMonths:6 };
export const AVV_VERSION = 'AVV-2026-10-30';      // must match avv_current() in the database

const e = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
const op = () => PROVIDER;
const provLine = () => { const o = PROVIDER; return [o.name, o.street, o.city].map(e).join(', ') + (isSet(o.email) ? ', ' + e(o.email) : ''); };
const opBlock = () => {
  const o = op();
  return [o.name, o.street, o.city, o.country].map(e).join('<br>') + '<br>E-Mail: ' + (isSet(o.email) ? '<a href="mailto:' + e(o.email) + '">' + e(o.email) + '</a>' : e(o.email)) + (o.phone ? '<br>Telefon: ' + e(o.phone) : '');
};
const firmLines = (f, rep) => [f.name, f.representative ? rep + ' ' + f.representative : '', f.street, [f.zip, f.city].filter(Boolean).join(' ')].filter(Boolean).map(e).join('<br>')
  + (f.email ? '<br>E-Mail: <a href="mailto:' + e(f.email) + '">' + e(f.email) + '</a>' : '') + (f.phone ? '<br>Telefon: ' + e(f.phone) : '');
const CTRL = {
  de:() => { const f = LEGAL_CTX.firm; return (f ? `<p>${firmLines(f, 'vertreten durch')}</p>${f.dpo ? `<p>Datenschutzbeauftragte/r: ${e(f.dpo)}</p>` : ''}`
      : '<p>Verantwortlich ist das Unternehmen, für das du Flyer verteilst und bei dem du in FlyerMap registriert bist. Seinen Namen und seine Anschrift siehst du in der App unter Profil → Datenschutz.</p>')
    + `<p>Die Software FlyerMap stellt ${provLine()} bereit. Der Anbieter verarbeitet die Daten nur im Auftrag und nach Weisung des Unternehmens (Auftragsverarbeitung nach Art. 28 DSGVO).</p>`; },
  ru:() => { const f = LEGAL_CTX.firm; return (f ? `<p>${firmLines(f, 'в лице')}</p>${f.dpo ? `<p>Уполномоченный по защите данных: ${e(f.dpo)}</p>` : ''}`
      : '<p>Ответственный — фирма, для которой вы раздаёте флаеры и в которой вы зарегистрированы в FlyerMap. Её название и адрес видны в приложении: Профиль → Политика конфиденциальности.</p>')
    + `<p>Программу FlyerMap предоставляет ${provLine()}. Поставщик обрабатывает данные только по поручению и указаниям фирмы (ст. 28 GDPR).</p>`; },
  en:() => { const f = LEGAL_CTX.firm; return (f ? `<p>${firmLines(f, 'represented by')}</p>${f.dpo ? `<p>Data protection officer: ${e(f.dpo)}</p>` : ''}`
      : '<p>The controller is the company you distribute flyers for and with which you are registered in FlyerMap. Its name and address are shown in the app under Profile → Privacy.</p>')
    + `<p>The FlyerMap software is provided by ${provLine()}, who processes the data only on behalf of and as instructed by the company (processor, Art. 28 GDPR).</p>`; },
};

/* ---------------- Datenschutzerklärung ---------------- */
const PRIVACY = {
  de:() => `
<h2>1. Verantwortlicher</h2>
${CTRL.de()}
<h2>2. Wofür ist die App?</h2>
<p>FlyerMap ist eine App, mit der das Unternehmen die Verteilung von Flyern organisiert: für die Personen, die für das Unternehmen Flyer verteilen, und für seine Disponenten (Administratoren). Die App plant Verteilgebiete und Laufrouten, teilt Aufträge zu und zeichnet während eines Arbeitstags die gelaufene Strecke auf, damit die Verteilung organisiert, abgerechnet und gegenüber den Kunden des Unternehmens nachgewiesen werden kann.</p>
<h2>3. Welche Daten wir verarbeiten</h2>
<ul>
<li><b>Konto:</b> Telefonnummer (Anmeldung per SMS-Code), Name, Städte, in denen du arbeiten kannst. Bei Administratoren: Telefonnummer oder E-Mail-Adresse.</li>
<li><b>Standort während eines Arbeitstags:</b> nur zwischen „Start" und „Feierabend" (in Pausen nicht): GPS-Punkte mit Uhrzeit und Genauigkeit, auch im Hintergrund bei gesperrtem Bildschirm. Administratoren sehen während des Arbeitstags deine aktuelle Position und dein Tempo. <b>Außerhalb eines Arbeitstags wird kein Standort erfasst.</b></li>
<li><b>Prüfung am Startpunkt:</b> Vor dem Start wird einmal dein Standort bestimmt, um zu prüfen, ob du am Startpunkt bist. Dieser Standort wird nur auf dem Gerät verwendet und nicht gespeichert.</li>
<li><b>Arbeitstage:</b> Datum, Beginn und Ende, Pausen, gelaufene Strecke, Ort (Ortsteil, Stadt), Auftrag, geschätzte Zahl verteilter Flyer.</li>
<li><b>Aufträge:</b> zugeteilte Routen, gewählte Arbeitstage, Annahme oder Ablehnung, Benachrichtigungen in der App.</li>
<li><b>Technische Daten:</b> IP-Adresse und Zeitpunkt in den Protokollen der Server, die die App und die Karten ausliefern.</li>
</ul>
<p>Keine Werbung, kein Tracking durch Dritte, kein Verkauf von Daten. Es findet keine automatisierte Entscheidung im Sinne von Art. 22 DSGVO statt; Hinweise zum Tempo prüft immer ein Mensch.</p>
<h2>4. Zwecke und Rechtsgrundlagen</h2>
<ul>
<li>Einteilung, Durchführung und Vergütung der Verteilarbeit (Konto, Aufträge, Arbeitszeiten): Art. 6 Abs. 1 lit. b DSGVO (Durchführung der Zusammenarbeit bzw. des Arbeits- oder Auftragsverhältnisses).</li>
<li>Aufzeichnung der Route während des Arbeitstags, Live-Position für die Disposition und Nachweis der Verteilung gegenüber Auftraggebern: Art. 6 Abs. 1 lit. b und lit. f DSGVO. Das berechtigte Interesse des Unternehmens ist der Nachweis der vereinbarten Leistung gegenüber seinen Kunden und eine sichere Disposition. Aufgezeichnet wird nur während der Arbeitszeit; die Spur wird nach ${RETENTION.trackMonths} Monaten gelöscht.</li>
<li>Aufbewahrung der Übersicht der Arbeitstage, soweit sie für die Abrechnung nötig ist: Art. 6 Abs. 1 lit. c DSGVO (steuer- und handelsrechtliche Aufbewahrungspflichten).</li>
</ul>
<p>Ohne Zugriff auf den Standort kann ein Arbeitstag nicht erfasst werden. Den Zugriff kannst du jederzeit in den Einstellungen deines Telefons entziehen.</p>
<h2>5. Empfänger und Dienstleister</h2>
<ul>
<li><b>Anbieter der Software</b> (siehe Abschnitt 1): Betrieb von FlyerMap als Auftragsverarbeiter des Unternehmens.</li>
<li><b>Supabase</b> (Supabase Inc., USA; Server in Frankfurt am Main, EU): Datenbank, Anmeldung, Speicherung aller oben genannten Daten. Auftragsverarbeitung nach Art. 28 DSGVO; für einen möglichen Zugriff aus den USA gelten EU-Standardvertragsklauseln.</li>
<li><b>SMS-Versand der Anmeldecodes</b> (z. B. Twilio Inc., USA): erhält deine Telefonnummer und den Code. Auftragsverarbeitung; Übermittlung in die USA auf Grundlage des EU-US Data Privacy Framework bzw. von Standardvertragsklauseln.</li>
<li><b>GitHub Pages</b> (GitHub Inc., USA): liefert die Web-Version der App und diese Seite aus (IP-Adresse in Server-Protokollen).</li>
<li><b>Karten:</b> Kartenbilder von tile.openstreetmap.de, Wege-/Zonenberechnung über valhalla1.openstreetmap.de (beide FOSSGIS e.V., Deutschland), Straßen- und Gebäudedaten über die Overpass-API (OpenStreetMap). Diese Dienste erhalten deine IP-Adresse und den angezeigten Kartenausschnitt.</li>
<li><b>Adresssuche und Ortsbestimmung:</b> Photon (komoot GmbH, Deutschland). Für die Übersicht der Arbeitstage wird für Tage ohne Auftrag der erste Punkt der Route einmal an Photon gesendet, um den Ortsnamen zu bestimmen; dabei werden keine Namen oder Telefonnummern übermittelt.</li>
<li><b>Navigation:</b> Nur wenn du „Navigation" oder „Weg zum Startpunkt" tippst, öffnet sich Google Maps oder Apple Karten mit dem Ziel; dort gelten deren Datenschutzbestimmungen.</li>
</ul>
<p>Innerhalb von FlyerMap sehen nur die Administratoren deines Unternehmens deine Daten; andere Unternehmen, die FlyerMap nutzen, sehen sie nicht. <b>Ausnahme mit deiner Einwilligung:</b> Schaltest du „Jobangebote von anderen Firmen“ ein (bei der Registrierung oder im Profil; Art. 6 Abs. 1 lit. a DSGVO), sehen Administratoren anderer Firmen in FlyerMap deinen Namen, deine Städte und deine Telefonnummer, um dir Arbeit anzubieten – keine Standorte und keine Arbeitstage. Verantwortlich dafür ist der Anbieter von FlyerMap; du kannst die Einwilligung jederzeit im Profil widerrufen. Die Betreuer des Anbieters (Master-Admins) können zur Betreuung, Fehlerbehebung und Sicherheit des Systems alle in FlyerMap gespeicherten Daten aller Firmen einsehen, einschließlich der Routen; sie nutzen sie nicht für eigene Zwecke. Andere Verteiler sehen weder deine Position noch deine Arbeitstage. Verteiler, die demselben Auftrag zugeteilt sind, sehen auf der Karte, welche Straßen dieses Auftrags schon verteilt sind – ohne Namen und ohne Uhrzeiten, damit niemand doppelt läuft.</p>
<h2>6. Speicherdauer</h2>
<ul>
<li>GPS-Punkte einer Route: ${RETENTION.trackMonths} Monate nach dem Arbeitstag, danach automatisch gelöscht. Die Übersicht des Tages (Datum, Zeiten, Ort, Strecke) bleibt.</li>
<li>Letzte bekannte Position: wird ${RETENTION.positionHours} Stunden nach Ende des Arbeitstags automatisch gelöscht.</li>
<li>Benachrichtigungen: ${RETENTION.inboxMonths} Monate.</li>
<li>Konto und Übersicht der Arbeitstage: bis zur Löschung des Kontos; Angaben, die für eine Abrechnung nötig sind, so lange gesetzliche Aufbewahrungspflichten bestehen (bis zu 10 Jahre).</li>
</ul>
<p>„Konto löschen" in der App entfernt sofort dein Konto mit allen Routen, GPS-Punkten und Arbeitstagen.</p>
<h2>7. Deine Rechte</h2>
<p>Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18) und Datenübertragbarkeit (Art. 20). Soweit wir uns auf berechtigte Interessen stützen, kannst du aus Gründen, die sich aus deiner besonderen Situation ergeben, <b>widersprechen</b> (Art. 21). Schreib dazu an das Unternehmen (Abschnitt 1).</p>
<p>Du kannst dich außerdem bei einer Datenschutz-Aufsichtsbehörde beschweren, z. B. bei der Landesbeauftragten für Datenschutz und Informationsfreiheit Nordrhein-Westfalen (LDI NRW), Kavalleriestraße 2–4, 40213 Düsseldorf.</p>
<h2>8. Änderungen</h2>
<p>Wenn sich diese Erklärung wesentlich ändert, zeigt dir die App den Hinweis zur Standortaufzeichnung vor dem nächsten Arbeitstag erneut an.</p>`,

  ru:() => `
<p class="muted">Перевод для удобства. Юридически действует немецкая версия.</p>
<h2>1. Ответственный</h2>
${CTRL.ru()}
<h2>2. Для чего приложение</h2>
<p>FlyerMap — приложение, с помощью которого фирма организует раздачу флаеров: для людей, которые раздают флаеры для фирмы, и для её диспетчеров (администраторов). Оно планирует зоны и маршруты, распределяет заказы и во время рабочего дня записывает пройденный путь, чтобы организовать и оплатить раздачу и подтвердить её перед клиентами фирмы.</p>
<h2>3. Какие данные мы обрабатываем</h2>
<ul>
<li><b>Аккаунт:</b> номер телефона (вход по SMS-коду), имя, города, где вы можете работать. У администраторов — телефон или email.</li>
<li><b>Геопозиция во время рабочего дня:</b> только между «Старт» и «Закончить» (во время паузы — нет): GPS-точки со временем и точностью, в том числе в фоне при заблокированном экране. Администраторы во время рабочего дня видят вашу текущую позицию и темп. <b>Вне рабочего дня геопозиция не записывается.</b></li>
<li><b>Проверка точки старта:</b> перед началом дня один раз определяется ваше местоположение, чтобы проверить, что вы на месте. Оно используется только на телефоне и не сохраняется.</li>
<li><b>Рабочие дни:</b> дата, начало и конец, паузы, пройденный путь, место (район, город), заказ, примерное число розданных флаеров.</li>
<li><b>Заказы:</b> назначенные маршруты, выбранные рабочие дни, согласие или отказ, уведомления в приложении.</li>
<li><b>Технические данные:</b> IP-адрес и время в журналах серверов, которые отдают приложение и карты.</li>
</ul>
<p>Без рекламы, без сторонних трекеров, без продажи данных. Автоматических решений (ст. 22 GDPR) нет: замечания о темпе всегда проверяет человек.</p>
<h2>4. Цели и правовые основания</h2>
<ul>
<li>Распределение, выполнение и оплата работы (аккаунт, заказы, время работы): ст. 6 п. 1 b GDPR (выполнение договора о сотрудничестве / трудового договора).</li>
<li>Запись маршрута во время рабочего дня, текущая позиция для диспетчера и подтверждение раздачи перед заказчиками: ст. 6 п. 1 b и f GDPR. Законный интерес фирмы — подтверждение выполненной работы перед её клиентами и надёжная диспетчеризация. Запись идёт только в рабочее время, трек удаляется через ${RETENTION.trackMonths} месяцев.</li>
<li>Хранение сводки рабочих дней, нужной для расчётов: ст. 6 п. 1 c GDPR (налоговые и торговые сроки хранения).</li>
</ul>
<p>Без доступа к геопозиции рабочий день записать нельзя. Доступ можно в любой момент отключить в настройках телефона.</p>
<h2>5. Получатели и сервисы</h2>
<ul>
<li><b>Поставщик программы</b> (см. раздел 1): работа FlyerMap по поручению фирмы.</li>
<li><b>Supabase</b> (Supabase Inc., США; серверы во Франкфурте, ЕС): база данных, вход, хранение всех данных выше. Обработка по поручению (ст. 28 GDPR); на случай доступа из США действуют стандартные договорные условия ЕС.</li>
<li><b>Отправка SMS-кодов</b> (например, Twilio Inc., США): получает номер телефона и код. Обработка по поручению; передача в США на основе EU-US Data Privacy Framework или стандартных договорных условий.</li>
<li><b>GitHub Pages</b> (GitHub Inc., США): отдаёт веб-версию приложения и эту страницу (IP-адрес в журналах).</li>
<li><b>Карты:</b> изображения карт с tile.openstreetmap.de, расчёт путей и зон через valhalla1.openstreetmap.de (оба — FOSSGIS e.V., Германия), данные улиц и зданий через Overpass API (OpenStreetMap). Эти сервисы получают IP-адрес и показанный участок карты.</li>
<li><b>Поиск адресов и определение места:</b> Photon (komoot GmbH, Германия). Для дней без заказа первая точка маршрута один раз отправляется в Photon, чтобы узнать название места; имя и телефон не передаются.</li>
<li><b>Навигация:</b> только если вы нажмёте «Навигация» или «Маршрут до точки старта», откроется Google Maps или Apple Карты; там действуют их правила.</li>
</ul>
<p>Внутри FlyerMap ваши данные видят только администраторы вашей фирмы; другие фирмы, работающие с FlyerMap, их не видят. <b>Исключение с вашего согласия:</b> если вы включите «Предложения работы от других фирм» (при регистрации или в профиле; ст. 6 п. 1 a GDPR), администраторы других фирм в FlyerMap увидят ваше имя, города и телефон, чтобы предложить работу, — без геопозиции и рабочих дней. За это отвечает поставщик FlyerMap; согласие можно отозвать в профиле в любой момент. Сотрудники поставщика (мастер-админы) для поддержки, исправления ошибок и безопасности системы могут видеть все данные всех фирм в FlyerMap, включая маршруты; для своих целей они их не используют. Другие раздатчики не видят ни вашу позицию, ни ваши рабочие дни. Раздатчики, назначенные на тот же заказ, видят на карте, какие улицы этого заказа уже пройдены — без имён и времени, чтобы никто не ходил дважды.</p>
<h2>6. Сроки хранения</h2>
<ul>
<li>GPS-точки маршрута: ${RETENTION.trackMonths} месяцев после рабочего дня, затем удаляются автоматически. Сводка дня (дата, время, место, путь) остаётся.</li>
<li>Последняя известная позиция: удаляется автоматически через ${RETENTION.positionHours} часов после конца рабочего дня.</li>
<li>Уведомления: ${RETENTION.inboxMonths} месяцев.</li>
<li>Аккаунт и сводка рабочих дней: до удаления аккаунта; данные, нужные для расчётов, — пока действуют законные сроки хранения (до 10 лет).</li>
</ul>
<p>«Удалить аккаунт» в приложении сразу удаляет аккаунт со всеми маршрутами, GPS-точками и рабочими днями.</p>
<h2>7. Ваши права</h2>
<p>Вы вправе получить информацию о своих данных (ст. 15 GDPR), исправить их (ст. 16), удалить (ст. 17), ограничить обработку (ст. 18) и получить их в переносимом виде (ст. 20). Там, где мы опираемся на законный интерес, вы можете <b>возразить</b> по причинам, связанным с вашей особой ситуацией (ст. 21). Пишите в фирму (раздел 1).</p>
<p>Вы также можете пожаловаться в надзорный орган по защите данных, например LDI NRW, Kavalleriestraße 2–4, 40213 Düsseldorf.</p>
<h2>8. Изменения</h2>
<p>Если этот текст существенно изменится, приложение снова покажет памятку о записи геопозиции перед следующим рабочим днём.</p>`,

  en:() => `
<p class="muted">Translation for convenience. The German version is legally binding.</p>
<h2>1. Controller</h2>
${CTRL.en()}
<h2>2. What the app is for</h2>
<p>FlyerMap is an app a company uses to organise flyer distribution: for the people who distribute flyers for the company and for its dispatchers (administrators). It plans areas and walking routes, assigns jobs and, during a working day, records the walked route so the work can be organised, paid and proven to the company's clients.</p>
<h2>3. Data we process</h2>
<ul>
<li><b>Account:</b> phone number (sign-in with an SMS code), name, cities you can work in. For administrators: phone number or email.</li>
<li><b>Location during a working day:</b> only between “Start” and “Finish” (not during breaks): GPS points with time and accuracy, also in the background with the screen locked. Administrators see your current position and pace during the working day. <b>No location is collected outside a working day.</b></li>
<li><b>Start-point check:</b> before starting, your location is determined once to check that you are at the start point. It is used on the phone only and not stored.</li>
<li><b>Working days:</b> date, start and end, breaks, distance walked, place (district, town), job, estimated number of flyers delivered.</li>
<li><b>Jobs:</b> assigned routes, chosen working days, acceptance or refusal, in-app notifications.</li>
<li><b>Technical data:</b> IP address and time in the logs of the servers delivering the app and the maps.</li>
</ul>
<p>No ads, no third-party tracking, no sale of data. No automated decision-making (Art. 22 GDPR); notes on pace are always reviewed by a person.</p>
<h2>4. Purposes and legal bases</h2>
<ul>
<li>Planning, carrying out and paying the work (account, jobs, working hours): Art. 6(1)(b) GDPR.</li>
<li>Recording the route during the working day, live position for dispatching and proof of delivery to clients: Art. 6(1)(b) and (f) GDPR. The company's legitimate interest is proving the agreed service to its clients and safe dispatching. Recording happens only during working time; the track is deleted after ${RETENTION.trackMonths} months.</li>
<li>Keeping the summary of working days needed for accounting: Art. 6(1)(c) GDPR (statutory retention duties).</li>
</ul>
<p>Without location access a working day cannot be recorded. You can withdraw access at any time in your phone settings.</p>
<h2>5. Recipients and service providers</h2>
<ul>
<li><b>Anbieter der Software</b> (siehe Abschnitt 1): Betrieb von FlyerMap als Auftragsverarbeiter des Unternehmens.</li>
<li><b>Provider of the software</b> (see section 1): runs FlyerMap as the company's processor.</li>
<li><b>Supabase</b> (Supabase Inc., USA; servers in Frankfurt am Main, EU): database, sign-in, storage of all data above. Processor under Art. 28 GDPR; EU standard contractual clauses cover any access from the USA.</li>
<li><b>SMS delivery of sign-in codes</b> (e.g. Twilio Inc., USA): receives your phone number and the code. Processor; transfer to the USA based on the EU-US Data Privacy Framework or standard contractual clauses.</li>
<li><b>GitHub Pages</b> (GitHub Inc., USA): serves the web version of the app and this page (IP address in server logs).</li>
<li><b>Maps:</b> map images from tile.openstreetmap.de, route/area calculation via valhalla1.openstreetmap.de (both FOSSGIS e.V., Germany), street and building data via the Overpass API (OpenStreetMap). These services receive your IP address and the map area shown.</li>
<li><b>Address search and place names:</b> Photon (komoot GmbH, Germany). For working days without a job, the first point of the route is sent to Photon once to find the place name; no names or phone numbers are sent.</li>
<li><b>Navigation:</b> only when you tap “Navigation” or “Way to the start point”, Google Maps or Apple Maps opens; their privacy terms apply there.</li>
</ul>
<p>Within FlyerMap only your company's administrators see your data; other companies using FlyerMap do not. <b>Exception with your consent:</b> if you switch on “Job offers from other companies” (at registration or in your profile; Art. 6(1)(a) GDPR), administrators of other companies in FlyerMap see your name, cities and phone number to offer you work — no locations and no working days. The provider of FlyerMap is responsible for this; you can withdraw consent in your profile at any time. The provider's support staff (master admins) can view all data of all companies stored in FlyerMap, including routes, for support, troubleshooting and system security; they do not use it for their own purposes. Other distributors see neither your position nor your working days. Distributors assigned to the same job see on the map which streets of that job are already done — without names or times, so nobody walks a street twice.</p>
<h2>6. Retention</h2>
<ul>
<li>GPS points of a route: ${RETENTION.trackMonths} months after the working day, then deleted automatically. The day summary (date, times, place, distance) remains.</li>
<li>Last known position: deleted automatically ${RETENTION.positionHours} hours after the end of the working day.</li>
<li>Notifications: ${RETENTION.inboxMonths} months.</li>
<li>Account and summary of working days: until the account is deleted; data needed for accounting as long as statutory retention applies (up to 10 years).</li>
</ul>
<p>“Delete account” in the app immediately removes your account with all routes, GPS points and working days.</p>
<h2>7. Your rights</h2>
<p>You have the right of access (Art. 15 GDPR), rectification (Art. 16), erasure (Art. 17), restriction (Art. 18) and data portability (Art. 20). Where we rely on legitimate interests you may <b>object</b> on grounds relating to your particular situation (Art. 21). Write to the company (section 1). You may also lodge a complaint with a supervisory authority, e.g. LDI NRW, Kavalleriestraße 2–4, 40213 Düsseldorf.</p>
<h2>8. Changes</h2>
<p>If this policy changes substantially, the app shows the location note again before your next working day.</p>`,
};

/* ---------------- Impressum (Anbieterkennzeichnung nach § 5 DDG) ---------------- */
const IMPRINT = {
  de:() => {
    const o = op();
    return `<h2>Angaben gemäß § 5 DDG</h2><p>${opBlock()}</p>
${o.register ? `<p>Registereintrag: ${e(o.register)}</p>` : ''}${o.vatId ? `<p>Umsatzsteuer-ID: ${e(o.vatId)}</p>` : ''}
<h2>Verantwortlich für den Inhalt</h2><p>${e(o.representative || o.name)}, Anschrift wie oben</p>
<h2>Kartendaten</h2><p>© OpenStreetMap-Mitwirkende, verfügbar unter der Open Database License (ODbL).</p>`;
  },
  ru:() => `<p class="muted">Немецкий закон требует указать, кто предоставляет приложение («Impressum»). Ниже — эти данные.</p>${IMPRINT.de()}`,
  en:() => `<p class="muted">Provider identification required by German law (“Impressum”).</p>${IMPRINT.de()}`,
};

export const LEGAL_TITLES = {
  privacy:{ de:'Datenschutzerklärung', ru:'Политика конфиденциальности', en:'Privacy policy' },
  imprint:{ de:'Impressum', ru:'Impressum (выходные данные)', en:'Imprint' },
};
export function legalHtml(kind, lang){
  const l = ['de', 'ru', 'en'].includes(lang) ? lang : 'de', src = kind === 'imprint' ? IMPRINT : PRIVACY;
  return src[l]();
}

/* short note shown in the app before the first working day (and again when PRIVACY_VERSION changes) */
export const LOCATION_NOTE = {
  de:{ title:'Hinweis zur Standortaufzeichnung', items:[
    'Während eines Arbeitstags – von „Start" bis „Feierabend", ohne Pausen – speichert die App deinen Standort, auch im Hintergrund.',
    'Die Administratoren sehen dann deine aktuelle Position, dein Tempo und die gelaufene Strecke. Andere Verteiler sehen deine Position nicht; wer im selben Auftrag ist, sieht nur, welche Straßen schon verteilt sind (ohne Namen).',
    'Außerhalb des Arbeitstags wird kein Standort erfasst.',
    `Die GPS-Spur wird nach ${RETENTION.trackMonths} Monaten gelöscht; die Übersicht des Tages (Datum, Zeiten, Ort, Strecke) bleibt für die Abrechnung.`,
    'Du kannst Auskunft und Löschung verlangen und widersprechen – Details in der Datenschutzerklärung.',
  ], ok:'Verstanden' },
  ru:{ title:'Памятка о записи геопозиции', items:[
    'Во время рабочего дня — от «Старт» до «Закончить», без пауз — приложение сохраняет вашу геопозицию, в том числе в фоне.',
    'Администраторы видят вашу текущую позицию, темп и пройденный путь. Другие раздатчики не видят вашу позицию; участники того же заказа видят только, какие улицы уже пройдены (без имён).',
    'Вне рабочего дня геопозиция не записывается.',
    `GPS-трек удаляется через ${RETENTION.trackMonths} месяцев; сводка дня (дата, время, место, путь) остаётся для расчётов.`,
    'Вы можете запросить информацию о данных, их удаление и возразить — подробно в политике конфиденциальности.',
  ], ok:'Понятно' },
};

/* full hosted page (privacy.html / impressum.html) with a language switch */
export function legalPage(kind){
  const T = LEGAL_TITLES[kind], langs = ['de', 'ru', 'en'];
  const sub = l => kind === 'privacy' ? ({ de:'Stand: ', ru:'Редакция: ', en:'Last updated: ' }[l] + PRIVACY_DATE[l]) : '';
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FlyerMap – ${e(T.de)}</title>
<style>
:root{--bg:#FFFFFF;--ink:#18212F;--muted:#5D6878;--line:#DCE1E7;--accent:#2563EB}
@media (prefers-color-scheme: dark){:root{--bg:#0B1220;--ink:#F1F5F9;--muted:#A3B1C4;--line:#29364A;--accent:#60A5FA}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
main{max-width:720px;margin:0 auto;padding:32px 16px 64px}h1{font-size:28px;line-height:1.2;margin:0 0 6px}h2{font-size:19px;margin:28px 0 8px}
.muted{color:var(--muted)}nav{display:flex;gap:14px;margin:18px 0 8px;border-bottom:1px solid var(--line);padding-bottom:10px;flex-wrap:wrap}
nav a{color:var(--muted);text-decoration:none}nav a.on{color:var(--ink);font-weight:600}section{display:none}section.on{display:block}a{color:var(--accent)}li{margin:4px 0}
footer{margin-top:40px;border-top:1px solid var(--line);padding-top:12px}
</style></head><body><main>
<h1>FlyerMap</h1>
<nav>${langs.map(l => `<a href="#${l}" data-l="${l}">${{ de:'Deutsch', ru:'Русский', en:'English' }[l]}</a>`).join('')}</nav>
${langs.map(l => `<section id="s-${l}"><h1 style="font-size:22px;margin-top:18px">${e(T[l])}</h1><div class="muted">${e(sub(l))}</div>${legalHtml(kind, l)}</section>`).join('\n')}
<footer class="muted"><a href="privacy.html">${e(LEGAL_TITLES.privacy.de)}</a>${IMPRINT_READY ? ` · <a href="impressum.html">${e(LEGAL_TITLES.imprint.de)}</a>` : ''}</footer>
</main>
<script>
function sel(l){ ${JSON.stringify(langs)}.forEach(function(x){ document.getElementById('s-'+x).classList.toggle('on',x===l); document.querySelector('[data-l='+x+']').classList.toggle('on',x===l); }); document.documentElement.lang=l; }
function pick(){ var h=location.hash.slice(1); return ${JSON.stringify(langs)}.indexOf(h)>=0?h:((navigator.language||'').indexOf('ru')===0?'ru':'de'); }
window.addEventListener('hashchange',function(){ sel(pick()); }); sel(pick());
</script></body></html>`;
}

/* ---------------- AVV (Art. 28 DSGVO) between a company and the provider; accepted electronically at company registration ---------------- */
export function avvHtml(firm){
  const f = firm && firm.name ? firm : null;
  const party = f ? [f.name, f.representative ? 'vertreten durch ' + f.representative : '', f.street, [f.zip, f.city].filter(Boolean).join(' ')].filter(Boolean).map(e).join(', ') : 'dem Unternehmen, das sich in FlyerMap registriert';
  return `<p>Vertrag zur Auftragsverarbeitung zwischen ${party} („Verantwortlicher“) und ${provLine()} („Auftragsverarbeiter“). Version ${e(AVV_VERSION)}.</p>
<h3>§ 1 Gegenstand und Dauer</h3><p>Der Auftragsverarbeiter stellt dem Verantwortlichen die Software FlyerMap (App und Web-Verwaltung) samt Server bereit. Der Vertrag gilt, solange der Verantwortliche FlyerMap nutzt.</p>
<h3>§ 2 Art und Zweck</h3><p>Planung von Verteilrouten, Einteilung der Verteiler, Erfassung von Arbeitszeit und gelaufener Strecke per GPS während des Arbeitstags, Nachweis der Verteilung, Benachrichtigungen.</p>
<h3>§ 3 Daten und Betroffene</h3><p>Betroffene: Verteiler und Administratoren des Verantwortlichen. Daten: Name, Telefonnummer, Städte; GPS-Punkte mit Zeit und Genauigkeit nur zwischen Start und Feierabend; Arbeitstage (Datum, Zeiten, Pausen, Strecke, Ort, Auftrag); Aufträge, Benachrichtigungen; technische Protokolle (IP-Adresse).</p>
<h3>§ 4 Weisungen</h3><p>Der Auftragsverarbeiter verarbeitet die Daten nur auf dokumentierte Weisung des Verantwortlichen, auch bei Übermittlungen in Drittländer. Hält er eine Weisung für rechtswidrig, informiert er den Verantwortlichen unverzüglich.</p>
<h3>§ 5 Vertraulichkeit und Zugriff des Anbieters</h3><p>Alle Personen mit Zugriff auf die Daten sind zur Vertraulichkeit verpflichtet. Betreuer des Auftragsverarbeiters (Master-Admins) haben zur Betreuung, Fehlerbehebung und Sicherheit des Systems Lesezugriff auf alle Daten des Verantwortlichen; sie nutzen sie ausschließlich dafür und nicht für eigene Zwecke. Verteiler, die ausdrücklich in Jobangebote anderer Firmen einwilligen, werden in diesem Umfang auch anderen Firmen angezeigt; dafür ist der Anbieter selbst verantwortlich.</p>
<h3>§ 6 Sicherheit (Art. 32 DSGVO)</h3><p>Anmeldung per SMS-Code; Rollen (Verteiler sehen nur eigene Daten, Administratoren nur die ihres Unternehmens); Zugriffsregeln in der Datenbank (Row Level Security); Verschlüsselung der Übertragung (TLS); Server in Frankfurt (EU); Standorterfassung nur zwischen Start und Feierabend; automatische Löschung; SMS-Versand nur an deutsche Mobilnummern mit Betrugsschutz. Die Maßnahmen werden dem Stand der Technik angepasst.</p>
<h3>§ 7 Unterauftragsverarbeiter</h3><p>Genehmigt sind: Supabase Inc. (Datenbank, Anmeldung; Server in Frankfurt), Twilio Inc. (SMS-Codes), GitHub Inc. (Auslieferung der Web-App) – jeweils mit Auftragsverarbeitungsvertrag und EU-US Data Privacy Framework bzw. Standardvertragsklauseln. Über neue Dienste informiert der Auftragsverarbeiter mindestens 14 Tage vorher; der Verantwortliche kann widersprechen.</p>
<h3>§ 8 Unterstützung</h3><p>Der Auftragsverarbeiter hilft bei Anfragen Betroffener (Auskunft, Berichtigung, Löschung, Datenübertragbarkeit), bei der Datenschutz-Folgenabschätzung und bei Meldungen nach Art. 33 und 34 DSGVO.</p>
<h3>§ 9 Datenpannen</h3><p>Verletzungen des Schutzes personenbezogener Daten meldet der Auftragsverarbeiter unverzüglich, spätestens binnen 24 Stunden nach Kenntnis.</p>
<h3>§ 10 Löschung und Rückgabe</h3><p>GPS-Punkte werden nach ${RETENTION.trackMonths} Monaten gelöscht, die letzte Position ${RETENTION.positionHours} Stunden nach Arbeitsende, Benachrichtigungen nach ${RETENTION.inboxMonths} Monaten. Nach Vertragsende gibt der Auftragsverarbeiter die Daten auf Wunsch als Export heraus und löscht sie binnen 30 Tagen, soweit keine Aufbewahrungspflicht besteht.</p>
<h3>§ 11 Nachweise und Kontrollen</h3><p>Der Auftragsverarbeiter stellt die nötigen Informationen bereit und ermöglicht Überprüfungen nach Absprache.</p>
<h3>§ 12 Schluss</h3><p>Es gilt deutsches Recht. Der Vertrag wird elektronisch geschlossen (Art. 28 Abs. 9 DSGVO), indem ein Administrator des Verantwortlichen ihn in der App annimmt; Datum und Version werden gespeichert.</p>`;
}
