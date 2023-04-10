import { createCanvas } from 'canvas';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import { TextItem } from 'pdfjs-dist/types/src/display/api';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';

import { zenkakuToHankaku } from '../utils';

dayjs.extend(utc);

export type Item = TextItem & {
  left: number;
  top: number;
};

export type UniversityEvent =
  | {
    roomType: 'lecture';
    lectureMethod: 'face-to-face' | 'live' | 'video';
    date: dayjs.Dayjs;
    location: string;
    room: string;
    time: number;
    subject: string;
    teacher: string;
    schoolGrade: number;
  }
  | {
    roomType: 'event';
    date: dayjs.Dayjs;
    location: string;
    room: string;
    time: number;
    subject: string;
    schoolGrade: number;
  }
  | {
    roomType: 'waiting room';
    date: dayjs.Dayjs;
    location: string;
    room: string;
    time: number;
  };

export type UniversityDisplayEvent = Omit<UniversityEvent, 'time'> & {
  time: {
    start: number;
    end: number;
  };
};

function groupTextItemsByCell(
  verticalWidths: number[],
  horizontalHeights: number[],
  items: Item[],
): Item[][][] {
  // セルの行数と列数を求める
  const numRows = horizontalHeights.length - 1;
  const numCols = verticalWidths.length - 1;

  // セルを初期化する
  const cells: Item[][][] = [];
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

export async function pdfToJson(pdfBuffer: ArrayBuffer) {
  const loadingTask = pdfjsLib.getDocument(pdfBuffer);
  const document = await loadingTask.promise;

  const timetables: UniversityEvent[][] = [];

  for (let i = 1; i <= document.numPages; i++) {
    const page = await document.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();

    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');
    await page.render({
      canvasContext: context as any,
      viewport: viewport,
    }).promise;

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

    const cells = groupTextItemsByCell(
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

    const normalizedCells = cells.map((row) =>
      row.map((col) => zenkakuToHankaku(col.map((item) => item.str).join(''))),
    );

    const rowRanges = [
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

    const timetable: UniversityEvent[] = [];

    rowRanges.forEach((rowRange) => {
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
        if (location === null) throw new Error('Invalid location');

        const roomNumber = rows[rowIndex][1];

        for (let dateCol = 3; dateCol <= 14; dateCol += 4) {
          row.slice(dateCol, dateCol + 4).forEach((col, colIndex) => {
            // console.log(
            //   '----------------------------------------------------------------',
            // );
            // console.log(col);

            // console.log('dateColIndex');
            const dateColIndex =
              3 <= dateCol && dateCol <= 6
                ? 4
                : 7 <= dateCol && dateCol <= 10
                  ? 8
                  : 11 <= dateCol && dateCol <= 14
                    ? 12
                    : null;
            if (dateColIndex === null) throw new Error('Invalid date');

            // console.log('dayjs');
            const date = dayjs(
              normalizedCells[rowRange.range.startRowIndex - 2][
                dateColIndex
              ].replace(/(\d+)月(\d+)日.*/, '2023-$1-$2'),
              'YYYY-M-D',
            );

            // console.log('getImageData');
            const x =
              rowRange.origin.x +
              103 +
              (dateCol - 3) * 132 +
              colIndex * 132 +
              3;
            const y = rowRange.origin.y + (rowIndex * 51) / 2 + 3;
            // console.log({ x, i2, y, rowIndex });
            // console.log(canvas.width, canvas.height);
            const { data: color } = context.getImageData(x, y, 1, 1);

            // console.log('processing grade');
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
              if (color[0] === 255 && color[1] === 255 && color[2] === 255)
                return;

              return;
            }

            if (grade === 'waiting room') {
              timetable.push({
                roomType: 'waiting room',
                date: date,
                location: location,
                room: roomNumber,
                time: colIndex + 1,
              });

              return;
            }

            let subject = rows[rowIndex][dateCol + colIndex];
            if (subject === '') return;

            const teacher = rows[rowIndex + 1][dateCol + colIndex];

            if (teacher === '') {
              timetable.push({
                roomType: 'event',
                date: date,
                location: location,
                room: roomNumber,
                time: colIndex + 1,
                subject,
                schoolGrade: grade,
              });

              return;
            }

            const lectureMethod =
              subject[1] === ':'
                ? subject.startsWith('対:')
                  ? 'face-to-face'
                  : subject.startsWith('配:')
                    ? 'live'
                    : subject.startsWith('オ:')
                      ? 'video'
                      : undefined
                : null;
            if (lectureMethod === undefined)
              throw new Error('Unknown lecture method');

            if (lectureMethod) subject = subject.slice(2);

            timetable.push({
              roomType: 'lecture',
              lectureMethod,
              date: date,
              location: location,
              room: roomNumber,
              time: colIndex + 1,
              subject,
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
    // .sort((a, b) => (a.room < b.room ? -1 : 1))
    // .sort((a, b) => (a.time < b.time ? -1 : 1))
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

  const displayTimetables: UniversityDisplayEvent[] = [];

  let continues: UniversityDisplayEvent | null = null;
  for (let i = 0; i < sortedTimetables.length - 1; i++) {
    const current: UniversityEvent = sortedTimetables[i];
    const next: UniversityEvent | undefined = sortedTimetables[i + 1];

    if (
      next &&
      current.room === next.room &&
      ((current.roomType !== 'waiting room' &&
        next.roomType !== 'waiting room' &&
        current.subject === next.subject) ||
        (current.roomType === 'waiting room' &&
          next.roomType === 'waiting room')) &&
      current.date.diff(next.date, 'd') === 0
    ) {
      continues = {
        ...current,
        time: {
          start: continues?.time.start ?? current.time,
          end: next.time,
        },
      };

      continue;
    } else if (continues) {
      displayTimetables.push(continues);
      continues = null;

      continue;
    }

    displayTimetables.push({
      ...current,
      time: {
        start: current.time,
        end: current.time,
      },
    });
  }

  return displayTimetables;
}
