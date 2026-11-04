// «Freund einladen» (referral bonus), 05.11.2026
import { T } from './i18n.js';
Object.assign(T.de, {
  refTitle:'Freund einladen', refHint:'Lade Freunde zum Flyer-Verteilen ein. Sobald dein Freund seinen ersten Auftrag erledigt hat, bekommst du {eur} € Bonus von der Firma.',
  refMsg:'Hi! Ich verteile Flyer bei {firm} – flexibel, du suchst dir die Tage selbst aus. Hier kannst du dir ein Konto erstellen: {link}',
  refYours:'Deine Einladungen', refNone:'Noch niemand eingeladen.', refSum:'{n} eingeladen · {eur} € verdient',
  refPending:'wartet auf ersten Auftrag', refQualified:'Bonus freigeschaltet', refPaid:'Bonus ausgezahlt', refRejected:'kein Bonus', refDeleted:'Konto gelöscht',
  refJoinTitle:'Konto erstellen', refJoinBy:'{by} lädt dich zu {firm} ein. Gib deinen Namen ein – Handynummer und Städte trägst du danach im Profil ein.',
  refAdminTitle:'Freunde-Bonus', refAdminHint:'Verteiler können Freunde mit ihrem eigenen Link einladen. Hat der Freund mind. 1 Std. an einem Auftrag gearbeitet und du setzt den Auftrag auf „erledigt“, wird der Bonus freigeschaltet. Auszahlen machst du selbst und markierst ihn hier als bezahlt.',
  refAmount:'Bonus pro Freund (€, 0 = aus)', refOff:'Der Freunde-Bonus ist aus.', refAdminNone:'Noch keine Einladungen.',
  refBy:'eingeladen von {name}', refApprove:'Freischalten', refMarkPaid:'Als bezahlt markieren', refReject:'Ablehnen', refUndo:'Zurücksetzen', refOpenSum:'{n} offen · {eur} € auszuzahlen',
  e_bad_amount:'Bitte einen Betrag zwischen 0 und 1000 € eingeben.', e_too_many:'Zu viele neue Konten heute. Bitte morgen noch einmal versuchen.',
});
Object.assign(T.ru, {
  refTitle:'Пригласить друга', refHint:'Приглашайте друзей раздавать флаеры. Как только друг выполнит первый заказ, вы получите от фирмы бонус {eur} €.',
  refMsg:'Привет! Я раздаю флаеры в {firm} – гибко, дни выбираешь сам. Здесь можно создать аккаунт: {link}',
  refYours:'Ваши приглашения', refNone:'Пока никого не пригласили.', refSum:'Приглашено: {n} · заработано {eur} €',
  refPending:'ждёт первого заказа', refQualified:'бонус открыт', refPaid:'бонус выплачен', refRejected:'без бонуса', refDeleted:'аккаунт удалён',
  refJoinTitle:'Создать аккаунт', refJoinBy:'{by} приглашает вас в {firm}. Введите имя – номер телефона и города потом впишете в профиле.',
  refAdminTitle:'Бонус за друга', refAdminHint:'Работники могут приглашать друзей своей личной ссылкой. Если друг отработал на заказе не меньше 1 ч и вы отметили заказ как выполненный, бонус открывается. Выплачиваете вы сами и отмечаете здесь как выплаченный.',
  refAmount:'Бонус за друга (€, 0 = выкл.)', refOff:'Бонус за друга выключен.', refAdminNone:'Приглашений пока нет.',
  refBy:'пригласил(а) {name}', refApprove:'Открыть бонус', refMarkPaid:'Отметить как выплачен', refReject:'Отклонить', refUndo:'Сбросить', refOpenSum:'Открыто: {n} · к выплате {eur} €',
  e_bad_amount:'Введите сумму от 0 до 1000 €.', e_too_many:'Сегодня слишком много новых аккаунтов. Попробуйте завтра.',
});
Object.assign(T.en, {
  refTitle:'Invite a friend', refHint:'Invite friends to distribute flyers. As soon as your friend has finished their first order, you get a {eur} € bonus from the company.',
  refMsg:'Hi! I distribute flyers for {firm} – flexible, you pick your own days. Create your account here: {link}',
  refYours:'Your invitations', refNone:'Nobody invited yet.', refSum:'{n} invited · {eur} € earned',
  refPending:'waiting for first order', refQualified:'bonus unlocked', refPaid:'bonus paid', refRejected:'no bonus', refDeleted:'account deleted',
  refJoinTitle:'Create account', refJoinBy:'{by} invites you to {firm}. Enter your name – phone and towns follow in your profile.',
  refAdminTitle:'Friend bonus', refAdminHint:'Workers can invite friends with their own link. Once the friend has worked at least 1 h on an order and you mark that order as done, the bonus is unlocked. You pay it yourself and mark it as paid here.',
  refAmount:'Bonus per friend (€, 0 = off)', refOff:'The friend bonus is off.', refAdminNone:'No invitations yet.',
  refBy:'invited by {name}', refApprove:'Unlock', refMarkPaid:'Mark as paid', refReject:'Reject', refUndo:'Reset', refOpenSum:'{n} open · {eur} € to pay',
  e_bad_amount:'Please enter an amount between 0 and 1000 €.', e_too_many:'Too many new accounts today. Please try again tomorrow.',
});
