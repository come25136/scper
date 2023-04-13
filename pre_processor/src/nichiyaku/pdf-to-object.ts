import { createCanvas } from 'canvas';
import * as dayjs from 'dayjs';
import * as dayjsUtc from 'dayjs/plugin/utc';
import * as dayjsTimezone from 'dayjs/plugin/timezone';
import { TextItem } from 'pdfjs-dist/types/src/display/api';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';

import { zenkakuToHankaku } from '../utils';
import { NichiyakuEvent, NichiyakuEventToJson } from './event';

dayjs.extend(dayjsUtc);
dayjs.extend(dayjsTimezone);

const pdfTargetRanges = [
  {
    range: {
      startRowIndex: 2,
      endRowIndex: 20,
    },
    origin: {
      x: 185,
      y: 109,
    },
  },
  {
    range: {
      startRowIndex: 23,
      endRowIndex: 41,
    },
    origin: {
      x: 185,
      y: 621,
    },
  },
];

const timeMap = {
  1: {
    start: {
      hour: 9,
      minute: 15,
    },
    end: {
      hour: 10,
      minute: 45,
    },
  },
  2: {
    start: {
      hour: 11,
      minute: 0,
    },
    end: {
      hour: 12,
      minute: 30,
    },
  },
  3: {
    start: {
      hour: 13,
      minute: 30,
    },
    end: {
      hour: 15,
      minute: 0,
    },
  },
  4: {
    start: {
      hour: 15,
      minute: 15,
    },
    end: {
      hour: 16,
      minute: 45,
    },
  },
} as const;

type PDFItem = TextItem & {
  left: number;
  top: number;
};

/**
 * 
 * @description PDFItemをセル毎に分ける
 * @param verticalWidths PDF上の横幅の幅間隔
 * @param horizontalHeights PDF上の縦幅の幅間隔
 */
function pdfItemToCells(
  verticalWidths: number[],
  horizontalHeights: number[],
  items: PDFItem[],
): PDFItem[][][] {
  // セルの行数と列数を求める
  const numRows = horizontalHeights.length - 1;
  const numCols = verticalWidths.length - 1;

  // セルを初期化する
  const cells: PDFItem[][][] = [];
  for (let row = 0; row < numRows; row++) {
    if (row === cells.length) cells.push([]);

    for (let col = 0; col < numCols; col++) {
      if (col === cells[row].length) cells[row].push([]);
    }
  }

  // textitemをセルに分類する
  for (const item of items) {
    // textitemが含まれる行番号を求める
    let row = -1;
    for (let i = 0; i < horizontalHeights.length - 1; i++) {
      // 縦幅が下のセルにはみ出してる場合があるので含めない
      if (
        horizontalHeights[i] <= item.top &&
        item.top /*+ item.height*/ <= horizontalHeights[i + 1]
      ) {
        row = i;
        break;
      }
    }

    let endRow = -1;
    for (let i = row; i < horizontalHeights.length - 1; i++) {
      if (
        horizontalHeights[i] <= item.top + item.height &&
        item.top + item.height <= horizontalHeights[i + 1]
      ) {
        endRow = i;
        break;
      }
    }

    // textitemが含まれる列番号を求める
    let col = -1;
    for (let i = 0; i < verticalWidths.length - 1; i++) {
      if (
        verticalWidths[i] <= item.left &&
        item.left /*+ item.width*/ <= verticalWidths[i + 1]
      ) {
        col = i;
        break;
      }
    }

    let endCol = -1;
    for (let i = col; i < verticalWidths.length - 1; i++) {
      if (
        verticalWidths[i] <= item.left + item.width &&
        item.left + item.width <= verticalWidths[i + 1]
      ) {
        endCol = i;
        break;
      }
    }

    // textitemを対応するセルに追加する
    if (row !== -1 && row !== -1 && col !== -1 && endCol !== -1) {
      for (let i = row; i <= row; i++) {
        for (let i2 = col; i2 <= endCol; i2++) {
          cells[i][i2].push(item);
        }
      }
    }
  }

  return cells;
}

function eventToJsonEvent(
  event: NichiyakuEvent,
  dateTime: {
    start: string | dayjs.Dayjs,
    end: dayjs.Dayjs
  }
): NichiyakuEventToJson {
  const jsonObj: Partial<NichiyakuEvent> & NichiyakuEventToJson = {
    ...event,
    dateTime: {
      start: typeof dateTime.start === 'string' ? dateTime.start : dateTime.start.toISOString(),
      end: dateTime.end.toISOString(),
    }
  }

  delete jsonObj.date

  return jsonObj
}

export async function pdfToJson(pdfBuffer: ArrayBuffer) {
  console.log('Loading pdf...')
  const loadingTask = pdfjsLib.getDocument(pdfBuffer);
  const document = await loadingTask.promise;

  const timetables: NichiyakuEvent[][] = [];

  for (let i = 1; i <= document.numPages; i++) {
    console.log(`Page ${i} is processing...`)

    const page = await document.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();

    console.log('Preparing canvas...')
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');
    await page.render({
      canvasContext: context as any,
      viewport: viewport,
    }).promise;

    console.log('Converting text position to pixels...')
    const items = textContent.items
      .filter((item): item is TextItem => 'str' in item)
      .map((item) => {
        // テキストアイテムの位置情報をピクセル単位で計算
        const transform = pdfjsLib.Util.transform(
          viewport.transform,
          item.transform,
        );

        return {
          ...item,
          left: transform[4],
          top: transform[5],
          width: item.width,
          height: item.height,
        };
      });

    console.log('Generating table data from text position data...')
    const cells = pdfItemToCells(
      [
        81, 113, 154, 185, 317, 449, 581, 713, 844, 976, 1108, 1240, 1372, 1504,
        1636, 1768,
      ],
      [
        73, 91, 109, 140, 160, 191, 211, 242, 262, 292, 312, 343, 363, 394, 414,
        445, 465, 496, 516, 546, 566, 585, 603, 621, 651, 672, 702, 723, 753,
        773, 804, 824, 854, 875, 905, 926, 956, 977, 1007, 1028, 1057, 1078,
      ],
      items,
    );

    console.log('Normalizing texts...')
    const normalizedCells = cells.map((row) =>
      row.map((col) => zenkakuToHankaku(col.map((item) => item.str).join(''))),
    );

    const timetable: NichiyakuEvent[] = [];

    console.log('Generating timetable data...')
    pdfTargetRanges.forEach((rowRange) => {
      const rows = normalizedCells.slice(
        rowRange.range.startRowIndex,
        rowRange.range.endRowIndex,
      );
      rows.forEach((row, rowIndex) => {
        if (rowIndex % 2 === 1) return;

        const location =
          0 <= rowIndex && rowIndex <= 5
            ? '1号館'
            : 6 <= rowIndex && rowIndex <= 13
              ? '2号館'
              : 14 <= rowIndex && rowIndex <= 17
                ? '3号館'
                : null;
        if (location === null) throw new Error(`Invalid location. rowIndex:${rowIndex}`);

        const roomNumber = rows[rowIndex][1];

        for (let dateCol = 3; dateCol <= 14; dateCol += 4) {
          row.slice(dateCol, dateCol + 4).forEach((col, colIndex) => {
            const text = rows[rowIndex][dateCol + colIndex];
            const isSkip = text === '';

            console.log(`Processing row:${rowIndex} col:${dateCol + colIndex} subject:"${rows[rowIndex][dateCol + colIndex]}" isSkip:${isSkip}`);

            if (isSkip) return

            if (!(0 <= colIndex && colIndex <= 3)) throw new Error('Invalid time column index')

            const dateColIndex =
              3 <= dateCol && dateCol <= 6
                ? 4
                : 7 <= dateCol && dateCol <= 10
                  ? 8
                  : 11 <= dateCol && dateCol <= 14
                    ? 12
                    : null;
            if (dateColIndex === null) throw new Error('Invalid date');

            const date = dayjs(
              normalizedCells[rowRange.range.startRowIndex - 2][
                dateColIndex
              ].replace(/(\d+)月(\d+)日.*/, '2023-$1-$2'),
              'YYYY-M-D',
            ).tz('Asia/Tokyo', true);

            const xPixel =
              rowRange.origin.x +
              103 +
              (dateCol - 3) * 132 +
              colIndex * 132 +
              3;
            const yPixel = rowRange.origin.y + (rowIndex * 51) / 2 + 3;
            const { data: color } = context.getImageData(xPixel, yPixel, 1, 1);

            const grade =
              color[0] === 204 && color[1] === 255 && color[2] === 255
                ? 1
                : color[0] === 255 && color[1] === 255 && color[2] === 0
                  ? 2
                  : color[0] === 255 && color[1] === 153 && color[2] === 204
                    ? 3
                    : color[0] === 255 && color[1] === 204 && color[2] === 153
                      ? 4
                      : color[0] === 204 && color[1] === 204 && color[2] === 255
                        ? 'waiting room'
                        : null;

            if (grade === null) {
              // どの学年にも割り当てられていなければスキップ
              if (color[0] === 255 && color[1] === 255 && color[2] === 255)
                return;

              // オンデマンド系はまだ実装していないのでスキップする
              // FIXME: 実装したらエラーに変える
              return
            }

            if (grade === 'waiting room') {
              timetable.push({
                type: 'waiting room',
                date: date,
                location: location,
                room: roomNumber,
                time: colIndex + 1 as NichiyakuEvent['time'],
              });

              return;
            }

            const teacher = rows[rowIndex + 1][dateCol + colIndex];

            if (teacher === '') {
              timetable.push({
                type: 'event',
                date: date,
                location: location,
                room: roomNumber,
                time: colIndex + 1 as NichiyakuEvent['time'],
                subject: text,
                schoolGrade: grade,
              });

              return;
            }

            if (text[1] !== ':')
              throw new Error(`Unknown lecture subject: ${text}`)

            const lectureMethodStr = text.split(':')[0]
            const lectureMethod = ({
              '対': 'face-to-face',
              '配': 'live',
              'オ': 'video'
            } as const)[lectureMethodStr]

            if (lectureMethod === undefined)
              throw new Error(`Unsupported lecture method: ${lectureMethodStr}`);

            timetable.push({
              type: 'lecture',
              lectureMethod,
              date: date,
              location: location,
              room: roomNumber,
              time: colIndex + 1 as NichiyakuEvent['time'],
              subject: text.slice(2),
              teacher: teacher,
              schoolGrade: grade,
            });
          });
        }
      });
    });

    timetables.push(timetable);
  }

  const sortedTimetables = timetables
    .flat(1)
    .sort((a, b) => {
      if (a.date.diff(b.date, 'd') !== 0) {
        return a.date.diff(b.date, 'd');
      }

      if (a.room !== b.room) {
        return Number(a.room) - Number(b.room);
      }

      if (a.time !== b.time) {
        return a.time - b.time;
      }

      return 0;
    });

  const displayTimetables: NichiyakuEventToJson[] = [];

  let continues: NichiyakuEventToJson | null = null;
  for (let i = 0; i < sortedTimetables.length - 1; i++) {
    const current: NichiyakuEvent = sortedTimetables[i];
    const next: NichiyakuEvent | undefined = sortedTimetables[i + 1];

    const currentRealTime = timeMap[current.time]
    const currentDateTime = current.date
      .set('h', currentRealTime.start.hour)
      .set('m', currentRealTime.start.minute)

    if (
      next &&
      current.room === next.room &&
      ((current.type !== 'waiting room' &&
        next.type !== 'waiting room' &&
        current.subject === next.subject) ||
        (current.type === 'waiting room' &&
          next.type === 'waiting room')) &&
      current.date.diff(next.date, 'd') === 0
    ) {
      const endRealTime = timeMap[next.time]
      const endDateTime = current.date
        .set('h', endRealTime.start.hour)
        .set('m', endRealTime.start.minute)

      continues = eventToJsonEvent(
        current,
        {
          start: continues?.dateTime.start ?? currentDateTime,
          end: endDateTime,
        },
      );

      continue;
    } else if (continues) {
      displayTimetables.push(continues);
      continues = null;

      continue;
    }

    const endDateTime = current.date
      .set('h', currentRealTime.end.hour)
      .set('m', currentRealTime.end.minute)

    displayTimetables.push(eventToJsonEvent(
      current,
      {
        start: currentDateTime,
        end: endDateTime,
      },
    ));
  }

  return displayTimetables;
}
