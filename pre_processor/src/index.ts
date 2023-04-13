import * as S3 from '@aws-sdk/client-s3';
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import * as env from 'env-var'

import { pdfToJson as nichiyakuPdfToObject } from './nichiyaku/pdf-to-object';
import { NichiyakuEventToJson } from './nichiyaku/event';

async function bootstrap() {
  const s3 = new S3.S3Client({
    region: 'auto',
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
      accessKeyId: env.get('S3_ACCESS_KEY').required().asString(),
      secretAccessKey: env.get('S3_SECRET_ACCESS_KEY').required().asString(),
    },
  });

  const auth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: Buffer.from(env.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY').required().asString(), 'base64').toString(),
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });

  const folderId = env.get('GOOGLE_DRIVE_FOLDER_ID').required().asString();

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
      if (typeof file.id !== 'string') continue

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

      let prevData: NichiyakuEventToJson[];
      if (first) {
        prevData = [];
      } else {
        try {
          console.log(`Fetching previous schedule data from Cloudflare R2. Object key:${objectParams.Key}`);
          const getObjectCommand = new S3.GetObjectCommand(objectParams);
          const getObjectResponse = await s3.send(getObjectCommand);
          if (getObjectResponse.Body === undefined) continue
          const originalData = await getObjectResponse.Body.transformToString();

          prevData = JSON.parse(originalData);
        } catch (err: any) {
          if (err.name !== 'NoSuchKey') throw err;

          prevData = [];
        }
      }

      prevData = [...prevData, ...displayTimetables];

      console.log(`Uploading schedule data... Object key:"${objectParams.Key}"`);
      const putObjectCommand = new S3.PutObjectCommand({
        ...objectParams,
        Body: JSON.stringify(prevData),
      });
      await s3.send(putObjectCommand);
      console.log(`Uploaded schedule data. Object key:"${objectParams.Key}"`);
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

  await processor(true, auth, folderId);
}

bootstrap();
