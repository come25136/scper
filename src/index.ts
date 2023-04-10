import { UniversityDisplayEvent, pdfToJson as nichiyakuPdfToObject } from './nichiyaku/pdf-to-object';

import { JWT } from 'google-auth-library';
import { google } from 'googleapis';
import * as S3 from '@aws-sdk/client-s3';

const s3 = new S3.S3Client({
  region: 'auto',
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
});

const auth = new JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, 'base64').toString(),
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});

const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

async function processor(
  first: boolean,
  auth: JWT,
  folderId: string,
  pageSize = 10,
  pageToken?: string,
) {
  const drive = google.drive({ version: 'v3', auth });

  const res = await drive.files.list({
    q: `'${folderId}' in parents`,
    pageSize,
    pageToken,
    fields: 'nextPageToken, files(id, name, mimeType)',
  });

  const files = res.data.files || [];

  for (const file of files) {
    if (file.mimeType !== 'application/pdf') continue;

    console.log(`Fetching pdf file from Google Drive. File name:"${file.name}"`)
    const content = await drive.files.get(
      { fileId: file.id, alt: 'media' },
      { responseType: 'arraybuffer' },
    );

    console.log(`Extracting schedule from pdf...`)
    const displayTimetables = await nichiyakuPdfToObject(content.data as ArrayBuffer);

    const objectParams = {
      Bucket: 'scper',
      Key: 'nichiyaku.ac.jp/schedule.json',
    };

    let prevData: UniversityDisplayEvent[];
    if (first) {
      prevData = [];
    } else {
      try {
        console.log(`Fetching previous schedule data from Cloudflare R2. Object key:${objectParams.Key}`);
        const getObjectCommand = new S3.GetObjectCommand(objectParams);
        const getObjectResponse = await s3.send(getObjectCommand);
        const originalData = await getObjectResponse.Body.transformToString();

        prevData = JSON.parse(originalData);
      } catch (err) {
        if (err.name !== 'NoSuchKey') throw err;

        prevData = [];
      }
    }

    prevData = [...prevData, ...displayTimetables];

    const putObjectCommand = new S3.PutObjectCommand({
      ...objectParams,
      Body: JSON.stringify(prevData),
    });
    await s3.send(putObjectCommand);
    console.log(`Uploaded schedule data. Object key:"${objectParams.Key}"`);

    // const jsonToIcsProcessData = displayTimetables
    //   .filter((event) => event.roomType !== 'waiting room' && event.grade === 1)
    //   .map((event) => {
    //     const timeMap = {
    //       1: {
    //         start: {
    //           hour: 9,
    //           minute: 15,
    //         },
    //         end: {
    //           hour: 10,
    //           minute: 45,
    //         },
    //       },
    //       2: {
    //         start: {
    //           hour: 11,
    //           minute: 0,
    //         },
    //         end: {
    //           hour: 12,
    //           minute: 30,
    //         },
    //       },
    //       3: {
    //         start: {
    //           hour: 13,
    //           minute: 30,
    //         },
    //         end: {
    //           hour: 15,
    //           minute: 0,
    //         },
    //       },
    //       4: {
    //         start: {
    //           hour: 15,
    //           minute: 15,
    //         },
    //         end: {
    //           hour: 16,
    //           minute: 45,
    //         },
    //       },
    //     } as const;

    //     const startTime = timeMap[event.startTime as 1 | 2 | 3 | 4];
    //     const startDateTime = event.date
    //       .set('h', startTime.start.hour)
    //       .set('m', startTime.start.minute)
    //       .utc();
    //     const endTime = timeMap[event.endTime as 1 | 2 | 3 | 4];
    //     const endDateTime = event.date
    //       .set('h', endTime.end.hour)
    //       .set('m', endTime.end.minute)
    //       .utc();

    //     let title =
    //       event.roomType === 'event'
    //         ? event.subject
    //         : event.roomType === 'lecture'
    //         ? event.subject
    //         : event.roomType === 'waiting room'
    //         ? '学生控室'
    //         : '不明';
    //     title = `【${event.room}】${title}`;
    //     const description =
    //       event.roomType === 'lecture'
    //         ? `講義室：${event.room}\n教師：${event.teacher}`
    //         : undefined;

    //     const start: [number, number, number, number, number] = [
    //       startDateTime.year(),
    //       startDateTime.month() + 1,
    //       startDateTime.date(),
    //       startDateTime.hour(),
    //       startDateTime.minute(),
    //     ];
    //     const end: [number, number, number, number, number] = [
    //       endDateTime.year(),
    //       endDateTime.month() + 1,
    //       endDateTime.date(),
    //       endDateTime.hour(),
    //       endDateTime.minute(),
    //     ];

    //     return {
    //       title,
    //       description,
    //       startInputType: 'utc' as const,
    //       start: start,
    //       endInputType: 'utc' as const,
    //       end: end,
    //       location: `日本薬科大学 お茶の水キャンパス${event.location} ${event.room}`,
    //     };
    //   });

    // const icsEvents = ics.createEvents(jsonToIcsProcessData);

    // const result = sortedTimetables.map((t) => ({
    //   ...t,
    //   date: t.date.format('YYYY/M/D'),
    // }));

    // console.table(result);

    // console.log(icsEvents);

    // await fs.writeFile(`./nichiyaku.ac.jp/1_year_student.ics`, icsEvents.value);
  }

  if (res.data.nextPageToken) {
    const nextPageFiles = await processor(
      false,
      auth,
      folderId,
      pageSize,
      res.data.nextPageToken,
    );
    files.push(...nextPageFiles);
  }

  return files;
}

async function bootstrap() {
  await processor(true, auth, folderId);
}

bootstrap();
