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
export const IMPRINT_READY = true;   // shown with [placeholders] until PROVIDER is filled in
export const PRIVACY_VERSION = '2026-10-30c';      // bump when the text changes in substance: workers then see the location note again
export const PRIVACY_DATE = { de:'6. November 2026', ru:'6 ноября 2026', en:'6 November 2026' };
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
<li><b>Konto:</b> Telefonnummer (Bestätigung per WhatsApp oder Login-Link vom Admin), Name, Städte, in denen du arbeiten kannst. Bei Administratoren: Telefonnummer oder E-Mail-Adresse.</li>
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
<li><b>WhatsApp-Bestätigung der Nummer</b> (Meta Platforms Ireland Ltd., Irland; WhatsApp Business Plattform): Wenn du deine Nummer per WhatsApp bestätigst, sendest du selbst eine Nachricht mit einem Code an die Nummer des Unternehmens. Meta übermittelt uns dabei deine Telefonnummer und den Nachrichtentext. Wir speichern nur Nummer, Code und Zeitpunkt der Bestätigung (Code-Einträge werden nach 30 Minuten ungültig). Auftragsverarbeitung; eine Übermittlung in die USA ist möglich (EU-US Data Privacy Framework bzw. Standardvertragsklauseln). Für die Nutzung von WhatsApp selbst gelten die Bedingungen von WhatsApp.</li>
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
<li><b>Аккаунт:</b> номер телефона (подтверждение через WhatsApp или Login-Link от админа), имя, города, где вы можете работать. У администраторов — телефон или email.</li>
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
<li><b>Подтверждение номера через WhatsApp</b> (Meta Platforms Ireland Ltd., Ирландия; WhatsApp Business Platform): вы сами отправляете сообщение с кодом на номер фирмы, Meta передаёт нам ваш номер и текст. Храним только номер, код и время подтверждения (код действует 30 минут). Обработка по поручению; возможна передача в США (EU-US Data Privacy Framework или стандартные договорные условия).</li>
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
<li><b>Account:</b> phone number (confirmed via WhatsApp or a login link from the admin), name, cities you can work in. For administrators: phone number or email.</li>
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
<li><b>Number confirmation via WhatsApp</b> (Meta Platforms Ireland Ltd., Ireland; WhatsApp Business Platform): you send a message with a code to the company's number yourself; Meta passes your number and the text to us. We only store number, code and time of confirmation (codes expire after 30 minutes). Processor; a transfer to the USA is possible (EU-US Data Privacy Framework or standard contractual clauses).</li>
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
  terms:{ de:'Nutzungsbedingungen', ru:'Условия использования', en:'Terms of use' },
  agb:{ de:'AGB für Unternehmen', ru:'AGB для фирм', en:'Terms for companies' },
  contract:{ de:'Rahmenvertrag für Verteiler', ru:'Рамочный договор раздатчика', en:'Framework contract for distributors' },
};
export function legalHtml(kind, lang){
  const l = ['de', 'ru', 'en'].includes(lang) ? lang : 'de';
  if(kind === 'contract') return contractHtml(LEGAL_CTX.firm, null, l);
  const src = { imprint:IMPRINT, terms:TERMS, agb:AGB }[kind] || PRIVACY;
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
<footer class="muted">${PAGES.map(([k, f]) => `<a href="${f}">${e(LEGAL_TITLES[k].de)}</a>`).join(' · ')}</footer>
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
<h3>§ 6 Sicherheit (Art. 32 DSGVO)</h3><p>Anmeldung per persönlichem Login-Link bzw. WhatsApp-Bestätigung der Nummer, Administratoren per E-Mail und Passwort; Rollen (Verteiler sehen nur eigene Daten, Administratoren nur die ihres Unternehmens); Zugriffsregeln in der Datenbank (Row Level Security); Verschlüsselung der Übertragung (TLS); Server in Frankfurt (EU); Standorterfassung nur zwischen Start und Feierabend; automatische Löschung; Bestätigungscodes gelten nur 30 Minuten und nur einmal. Die Maßnahmen werden dem Stand der Technik angepasst.</p>
<h3>§ 7 Unterauftragsverarbeiter</h3><p>Genehmigt sind: Supabase Inc. (Datenbank, Anmeldung; Server in Frankfurt), Meta Platforms Ireland Ltd. (WhatsApp-Bestätigung der Telefonnummer), GitHub Inc. (Auslieferung der Web-App) – jeweils mit Auftragsverarbeitungsvertrag und EU-US Data Privacy Framework bzw. Standardvertragsklauseln. Über neue Dienste informiert der Auftragsverarbeiter mindestens 14 Tage vorher; der Verantwortliche kann widersprechen.</p>
<h3>§ 8 Unterstützung</h3><p>Der Auftragsverarbeiter hilft bei Anfragen Betroffener (Auskunft, Berichtigung, Löschung, Datenübertragbarkeit), bei der Datenschutz-Folgenabschätzung und bei Meldungen nach Art. 33 und 34 DSGVO.</p>
<h3>§ 9 Datenpannen</h3><p>Verletzungen des Schutzes personenbezogener Daten meldet der Auftragsverarbeiter unverzüglich, spätestens binnen 24 Stunden nach Kenntnis.</p>
<h3>§ 10 Löschung und Rückgabe</h3><p>GPS-Punkte werden nach ${RETENTION.trackMonths} Monaten gelöscht, die letzte Position ${RETENTION.positionHours} Stunden nach Arbeitsende, Benachrichtigungen nach ${RETENTION.inboxMonths} Monaten. Nach Vertragsende gibt der Auftragsverarbeiter die Daten auf Wunsch als Export heraus und löscht sie binnen 30 Tagen, soweit keine Aufbewahrungspflicht besteht.</p>
<h3>§ 11 Nachweise und Kontrollen</h3><p>Der Auftragsverarbeiter stellt die nötigen Informationen bereit und ermöglicht Überprüfungen nach Absprache.</p>
<h3>§ 12 Schluss</h3><p>Es gilt deutsches Recht. Der Vertrag wird elektronisch geschlossen (Art. 28 Abs. 9 DSGVO), indem ein Administrator des Verantwortlichen ihn in der App annimmt; Datum und Version werden gespeichert.</p>`;
}

/* ---------------- hosted pages ---------------- */
export const PAGES = [['imprint', 'impressum.html'], ['privacy', 'privacy.html'], ['terms', 'nutzungsbedingungen.html'], ['agb', 'agb.html'], ['contract', 'rahmenvertrag.html']];

const RU_DE = '<p class="muted">Юридически действует немецкий текст. Краткое содержание по-русски:</p>';
const EN_DE = '<p class="muted">The German text is legally binding. Short summary in English:</p>';
const ul = a => '<ul>' + a.map(x => `<li>${x}</li>`).join('') + '</ul>';

/* ---------------- Nutzungsbedingungen (for everyone using the app; the provider's own terms) ---------------- */
const TERMS = {
  de:() => `<p>Diese Bedingungen gelten für die Nutzung der App FlyerMap, bereitgestellt von ${provLine()} („Anbieter“).</p>
<h2>1. Leistung</h2><p>FlyerMap ist eine Software zur Planung und Dokumentation von Flyerverteilungen. Der Anbieter stellt nur die Software bereit. Er ist nicht Vertragspartner der Verteilaufträge; diese schließen Verteiler und das jeweilige Unternehmen direkt miteinander.</p>
<h2>2. Konto</h2><p>Jede Person nutzt nur ihr eigenes Konto und gibt Zugangsdaten und Login-Links nicht weiter. Angaben (Name, Telefonnummer) müssen zutreffen. Ein Konto darf nur auf einem Gerät gleichzeitig arbeiten.</p>
<h2>3. Pflichten bei der Nutzung</h2><p>Verboten sind insbesondere: falsche Standortdaten (z. B. GPS-Fälschung), automatisierte Zugriffe, Eingriffe in die Sicherheit der App, Nutzung für fremde oder rechtswidrige Zwecke.</p>
<h2>4. Verfügbarkeit</h2><p>Der Anbieter bemüht sich um eine hohe Verfügbarkeit, schuldet aber keine ununterbrochene Erreichbarkeit. Routen, Zeiten und Briefkastenzahlen sind Schätzungen aus Kartendaten (© OpenStreetMap-Mitwirkende) und können abweichen.</p>
<h2>5. Haftung</h2><p>Der Anbieter haftet unbeschränkt bei Vorsatz, grober Fahrlässigkeit und für Schäden aus der Verletzung von Leben, Körper oder Gesundheit. Bei leichter Fahrlässigkeit haftet er nur für die Verletzung wesentlicher Pflichten und begrenzt auf den vorhersehbaren, typischen Schaden. Die Nutzung der Navigation im Straßenverkehr erfolgt auf eigene Verantwortung; Verkehrsregeln gehen immer vor.</p>
<h2>6. Sperrung und Ende</h2><p>Bei Verstößen kann ein Konto gesperrt werden. Das Konto kann jederzeit in der App gelöscht werden.</p>
<h2>7. Änderungen</h2><p>Änderungen dieser Bedingungen werden in der App angekündigt.</p>
<h2>8. Schluss</h2><p>Es gilt deutsches Recht. Datenschutz: siehe Datenschutzerklärung.</p>`,
  ru:() => RU_DE + ul(['Поставщик даёт только программу; договор на раздачу заключают раздатчик и фирма напрямую.', 'Один аккаунт — один человек и один телефон; ссылки входа не передавать.', 'Запрещено подделывать GPS и вмешиваться в работу приложения.', 'Маршруты и число ящиков — оценки, возможны расхождения.', 'Ответственность ограничена (кроме умысла, грубой небрежности и вреда здоровью). На дороге правила движения важнее навигации.', 'За нарушения аккаунт может быть заблокирован; удалить аккаунт можно в приложении.']) + TERMS.de(),
  en:() => EN_DE + ul(['The provider only supplies the software; distribution contracts are made between the distributor and the company directly.', 'One account per person and per phone; do not share login links.', 'GPS spoofing and interfering with the app are prohibited.', 'Routes and mailbox counts are estimates.', 'Liability is limited (except intent, gross negligence and injury). Traffic rules always come first.', 'Accounts may be blocked for violations and can be deleted in the app.']) + TERMS.de(),
};

/* ---------------- AGB for companies (B2B, software as a service) – draft with placeholders ---------------- */
const AGB = {
  de:() => `<p class="muted">Entwurf – vor dem offiziellen Start rechtlich prüfen lassen.</p>
<h2>§ 1 Geltung</h2><p>Diese AGB gelten für alle Verträge zwischen ${provLine()} („Anbieter“) und Unternehmen („Kunde“) über die Nutzung von FlyerMap. Sie gelten nur gegenüber Unternehmern (§ 14 BGB). Abweichende Bedingungen des Kunden gelten nicht.</p>
<h2>§ 2 Leistung</h2><p>Der Anbieter stellt die Software FlyerMap (App und Web-Verwaltung) als Online-Dienst bereit: Routenplanung, Zuteilung an Verteiler, GPS-Nachweis, Auswertungen. Der Kunde schließt die Verträge mit seinen Verteilern selbst; der Anbieter ist daran nicht beteiligt. Der in der App angebotene Muster-Rahmenvertrag ist ein unverbindlicher Vorschlag ohne Rechtsberatung; der Kunde prüft und verantwortet seine Verträge selbst.</p>
<h2>§ 3 Vertragsschluss und Laufzeit</h2><p>Der Vertrag kommt mit der Registrierung des Kunden in der App zustande. Laufzeit: [monatlich, kündbar zum Monatsende in Textform].</p>
<h2>§ 4 Vergütung</h2><p>[Preis, z. B. … € pro aktivem Verteiler und Monat zzgl. USt.]. Zahlung binnen 14 Tagen nach Rechnung. Während der Testphase ist die Nutzung kostenlos.</p>
<h2>§ 5 Pflichten des Kunden</h2><p>Der Kunde informiert seine Verteiler über die Standorterfassung, nutzt die Daten nur zu den vereinbarten Zwecken, beachtet das Arbeits- und Sozialversicherungsrecht (insbesondere die richtige Einordnung als Arbeitnehmer oder Selbständige) sowie Verbote der Verteilung an Briefkästen mit Werbeverbot, soweit es sich um Werbung handelt.</p>
<h2>§ 6 Verfügbarkeit</h2><p>Angestrebte Verfügbarkeit [98 %] im Monatsmittel, ausgenommen Wartung und Störungen außerhalb des Einflussbereichs des Anbieters (z. B. Hosting, Mobilfunk, Kartendienste).</p>
<h2>§ 7 Haftung</h2><p>Unbeschränkte Haftung bei Vorsatz, grober Fahrlässigkeit, Verletzung von Leben, Körper, Gesundheit und nach dem Produkthaftungsgesetz. Im Übrigen nur bei Verletzung wesentlicher Vertragspflichten, begrenzt auf den vertragstypischen, vorhersehbaren Schaden, höchstens [die Vergütung der letzten 12 Monate]. Keine Haftung für entgangenen Gewinn und für die Richtigkeit geschätzter Routen- und Briefkastendaten.</p>
<h2>§ 8 Datenschutz</h2><p>Der Kunde ist Verantwortlicher für die Daten seiner Verteiler; es gilt der in der App abgeschlossene Auftragsverarbeitungsvertrag (${e(AVV_VERSION)}).</p>
<h2>§ 9 Daten nach Vertragsende</h2><p>Export auf Wunsch, Löschung binnen 30 Tagen nach Vertragsende, soweit keine Aufbewahrungspflicht besteht.</p>
<h2>§ 10 Schluss</h2><p>Deutsches Recht. Gerichtsstand ist [Sitz des Anbieters], soweit gesetzlich zulässig. Änderungen der AGB werden 30 Tage vorher in Textform angekündigt; widerspricht der Kunde nicht, gelten sie als angenommen.</p>`,
  ru:() => RU_DE + ul(['AGB действуют только для фирм (B2B).', 'Поставщик даёт программу; договоры с раздатчиками фирма заключает сама и сама за них отвечает (типовой договор в приложении — только образец).', 'Цена и срок — [заполнить]; во время теста бесплатно.', 'Фирма сама отвечает за правильное оформление раздатчиков (работник или самозанятый) и за запрет рекламы на ящиках.', 'Ответственность поставщика ограничена.', 'Данные: действует AVV; после окончания — экспорт и удаление за 30 дней.']) + AGB.de(),
  en:() => EN_DE + ul(['B2B only.', 'The provider supplies the software; companies contract their distributors themselves (the in-app contract is only a template).', 'Price and term: [to be filled in]; free during the test phase.', 'Companies are responsible for classifying distributors correctly and respecting “no advertising” mailboxes.', 'Limited liability.', 'Data processing agreement applies; export and deletion within 30 days after the end.']) + AGB.de(),
};

/* ---------------- Rahmenvertrag: company ↔ freelance distributor. Standard text; a company may replace it. ---------------- */
export const CONTRACT_STD_VERSION = 'RV-2026-11-05';   // must match contract_std_version() in the database
const eur = n => (Math.round((+n || 0) * 100) / 100).toLocaleString('de-DE', { minimumFractionDigits:0, maximumFractionDigits:2 }) + ' €';
const firmParty = f => f && f.name ? [f.name, f.representative ? 'vertreten durch ' + f.representative : '', f.street, [f.zip, f.city].filter(Boolean).join(' ')].filter(Boolean).map(e).join(', ') : '[Unternehmen, Anschrift]';
// cfg: { text, cancel_hours, penalty_eur } (from the database); custom text: plain text, blank lines = paragraphs, {firma} {stunden} {strafe} filled in
export function contractHtml(firm, cfg, lang = 'de'){
  const c = cfg || {}, h = c.cancel_hours != null ? c.cancel_hours : 48, pen = c.penalty_eur != null ? c.penalty_eur : 50;
  if(c.text) return c.text.split(/\n\s*\n/).map(p => `<p>${e(p).replace(/\n/g, '<br>').replace(/\{firma\}/g, firmParty(firm)).replace(/\{stunden\}/g, h).replace(/\{strafe\}/g, eur(pen))}</p>`).join('');
  const sum = lang === 'ru' ? RU_DE + ul([`Вы работаете как самостоятельный предприниматель (Gewerbe) и выставляете фирме счета (Rechnung).`, `Сам договор не обязывает брать заказы. Но нажав «Verbindlich zusagen» в приложении, вы <b>обязаны</b> выполнить этот заказ в выбранные дни.`, `Отменить бесплатно можно не позднее чем за <b>${h} ч</b> до начала первого дня (08:00). Позже — только по уважительной причине (болезнь, форс-мажор), сразу сообщить.`, `Неявка или поздняя отмена без уважительной причины, а также выброшенные/не разнесённые флаеры: <b>штраф ${eur(pen)}</b> за каждый день (засчитывается в возмещение ущерба, можно удержать из счёта).`, `Флаеры только в ящики по маршруту, не выбрасывать; GPS-запись во время работы — как доказательство.`, `Оплата — по часам из приложения (без пауз), налоги и страхование — сами.`, `Договор можно расторгнуть в любой момент; уже подтверждённые заказы нужно выполнить.`])
    : lang === 'en' ? EN_DE + ul([`You work as a self-employed contractor and invoice the company.`, `The framework contract itself does not oblige you to take orders. Tapping “Verbindlich zusagen” makes that order <b>binding</b> for the chosen days.`, `Free cancellation up to <b>${h} h</b> before the first day (08:00). Later only for good cause (illness, force majeure), to be reported at once.`, `No-show or late cancellation without good cause, or dumped / undistributed flyers: <b>contractual penalty of ${eur(pen)}</b> per day (offset against damages, may be deducted from your invoice).`, `Hourly pay as recorded in the app (without breaks); you handle tax and insurance yourself.`, `Terminable at any time; confirmed orders must still be completed.`]) : '';
  return sum + `<p>Rahmenvertrag über die selbständige Verteilung von Werbemitteln (Version ${e(CONTRACT_STD_VERSION)})</p>
<p>zwischen ${firmParty(firm)} („Auftraggeber“) und der in FlyerMap registrierten Person („Auftragnehmer“).</p>
<h3>§ 1 Gegenstand</h3><p>Der Auftragnehmer verteilt für den Auftraggeber Flyer und andere Werbemittel als selbständiger Unternehmer. Ein Arbeitsverhältnis wird nicht begründet. Dieser Rahmenvertrag regelt die Bedingungen der einzelnen Verteilaufträge; er verpflichtet keine Seite, Einzelaufträge anzubieten oder anzunehmen.</p>
<h3>§ 2 Einzelauftrag und verbindliche Zusage</h3><p>Der Auftraggeber bietet Einzelaufträge in der App FlyerMap an (Gebiet, Route, Umfang, Arbeitstage). Mit der Bestätigung „Verbindlich zusagen“ (bzw. Übernahme einer freien Route) nimmt der Auftragnehmer den Einzelauftrag an. Ab diesem Zeitpunkt ist er verpflichtet, den Auftrag an den zugesagten Tagen vollständig und ordnungsgemäß auszuführen. Datum, Uhrzeit und Vertragsversion der Zusage werden gespeichert.</p>
<h3>§ 3 Ausführung</h3><p>Der Auftragnehmer wirft die Werbemittel entlang der Route in die Briefkästen ein, nicht in Briefkästen mit Hinweis „Keine Werbung“ o. Ä., sofern der Auftraggeber nichts anderes für nicht-werbliche Inhalte bestimmt. Werbemittel dürfen nicht weggeworfen, gestapelt abgelegt oder an Dritte weitergegeben werden. Innerhalb des Auftrags bestimmt der Auftragnehmer Reihenfolge, Arbeitsbeginn und Pausen selbst. Zur Abrechnung und zum Nachweis zeichnet die App während der Arbeitszeit die gelaufene Strecke auf (siehe Datenschutzerklärung).</p>
<h3>§ 4 Absage</h3><p>Der Auftragnehmer kann einen zugesagten Einzelauftrag bis ${h} Stunden vor Beginn des ersten zugesagten Arbeitstags (08:00 Uhr) in der App kostenfrei absagen. Danach ist eine Absage nur aus wichtigem Grund möglich, insbesondere bei Krankheit (auf Verlangen mit Nachweis) oder höherer Gewalt; sie ist unverzüglich in der App oder telefonisch mitzuteilen.</p>
<h3>§ 5 Vertragsstrafe</h3><p>Erscheint der Auftragnehmer schuldhaft nicht zu einem zugesagten Arbeitstag, sagt er nach Ablauf der Frist aus § 4 ohne wichtigen Grund ab, oder entsorgt er Werbemittel bzw. verteilt sie entgegen § 3 nicht, zahlt er für jeden betroffenen Arbeitstag eine Vertragsstrafe von ${eur(pen)}, insgesamt höchstens das Dreifache je Einzelauftrag. Die Vertragsstrafe wird auf einen weitergehenden Schadensersatz angerechnet. Dem Auftragnehmer bleibt der Nachweis vorbehalten, dass kein oder ein geringerer Schaden entstanden ist. Der Auftraggeber kann die Vertragsstrafe mit Vergütungsansprüchen verrechnen.</p>
<h3>§ 6 Vergütung und Rechnung</h3><p>Die Vergütung richtet sich nach dem vereinbarten Stundensatz [… € / Stunde] für die in der App erfasste Arbeitszeit ohne Pausen, soweit im Einzelauftrag nichts anderes vereinbart ist. Der Auftragnehmer stellt nach Abschluss des Einzelauftrags eine Rechnung; sie ist binnen 14 Tagen zahlbar. Steuern, Gewerbeanmeldung und Versicherungen sind Sache des Auftragnehmers.</p>
<h3>§ 7 Mängel</h3><p>Ist ein Teil der Route nachweislich nicht verteilt, kann der Auftraggeber Nachholung verlangen oder die Vergütung für diesen Teil kürzen.</p>
<h3>§ 8 Weitere Auftraggeber</h3><p>Der Auftragnehmer darf auch für andere Auftraggeber tätig sein.</p>
<h3>§ 9 Laufzeit</h3><p>Der Rahmenvertrag gilt auf unbestimmte Zeit und kann von beiden Seiten jederzeit in Textform gekündigt werden. Bereits zugesagte Einzelaufträge sind noch auszuführen, es sei denn, beide Seiten heben sie auf.</p>
<h3>§ 10 Schluss</h3><p>Der Vertrag wird elektronisch geschlossen, indem der Auftragnehmer ihn in der App bestätigt; Version und Zeitpunkt werden gespeichert. Änderungen werden in der App angezeigt und gelten für neue Einzelaufträge nach erneuter Bestätigung. Es gilt deutsches Recht. Sollte eine Bestimmung unwirksam sein, bleibt der Vertrag im Übrigen wirksam.</p>`;
}
