// AI phase A (16.11.2026): optional number in the help report form
import { T } from './i18n.js';
Object.assign(T.de, {
  haAmtBoxes:'Wie viele Briefkästen ungefähr?', haAmtFlyers:'Wie viele Flyer ungefähr?', haOptional:'(freiwillig)', haAmtPh:'z. B. 30',
  haDetail:'Zu wenig oder übrig?', haShort:'Zu wenig', haLeftover:'Übrig',
  haInTextBoxes:'≈ {n} Briefkästen', haInTextFlyers:'≈ {n} Flyer',
  e_amount_invalid:'Bitte eine ganze Zahl zwischen 0 und 100 000 eingeben – oder das Feld leer lassen.', e_detail_invalid:'Bitte „Es fehlen“ oder „Übrig“ wählen.',
  helpAmount:'Anzahl', helpAmountShort:'fehlen', helpAmountLeft:'übrig',
});
Object.assign(T.ru, {
  haAmtBoxes:'Сколько примерно ящиков?', haAmtFlyers:'Сколько примерно флаеров?', haOptional:'(необязательно)', haAmtPh:'напр. 30',
  haDetail:'Не хватает или остались?', haShort:'Не хватает', haLeftover:'Остались',
  haInTextBoxes:'≈ {n} ящиков', haInTextFlyers:'≈ {n} флаеров',
  e_amount_invalid:'Введи целое число от 0 до 100 000 — или оставь поле пустым.', e_detail_invalid:'Выбери «не хватает» или «остались».',
  helpAmount:'Количество', helpAmountShort:'не хватает', helpAmountLeft:'осталось',
});
Object.assign(T.en, {
  haAmtBoxes:'About how many mailboxes?', haAmtFlyers:'About how many flyers?', haOptional:'(optional)', haAmtPh:'e.g. 30',
  haDetail:'Short or left over?', haShort:'Short', haLeftover:'Left over',
  haInTextBoxes:'≈ {n} mailboxes', haInTextFlyers:'≈ {n} flyers',
  e_amount_invalid:'Please enter a whole number from 0 to 100,000 – or leave the field empty.', e_detail_invalid:'Please choose “short” or “left over”.',
  helpAmount:'Amount', helpAmountShort:'short', helpAmountLeft:'left over',
});
