const lesson = (subject, teacher) => ({ subject, teacher });
const elective = () => lesson('理地歴', '石／沖／川（D／F／中）');
export const TIMETABLE = {
  1: [lesson('漢文','神保'), lesson('現代文','山藤'), lesson('数Ⅲ','望月'), lesson('物理','永江'), elective(), lesson('英語Ⅱ','川崎')],
  2: [lesson('体育Y','吉田薫'), lesson('物理','永江'), elective(), lesson('数演習','小宮'), lesson('古文','野谷'), lesson('理理数探','名／北／出（小／－／－）')],
  3: [lesson('数C','藤倉'), lesson('現／古','山藤／野谷'), elective(), lesson('化学','淡野'), lesson('英語Ⅲ','ウェスリー'), lesson('英Ⅰ／Ⅱ','脇濱／川崎')],
  4: [lesson('数C','藤倉'), lesson('数Ⅲ','望月'), lesson('物理','永江'), lesson('体育Y','吉田薫'), lesson('化学','淡野'), lesson('英語Ⅰ','脇濱')],
  5: [lesson('古文','野谷'), lesson('数Ⅲ','望月'), lesson('英語Ⅲ','ウェスリー'), lesson('英語Ⅱ','川崎'), lesson('現代文','山藤'), lesson('体育Y','吉田薫')],
  6: [lesson('漢文','神保'), lesson('英語Ⅰ','脇濱'), lesson('化学','淡野'), lesson('数演習','小宮')],
};
