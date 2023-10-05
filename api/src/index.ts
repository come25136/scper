
import * as S3 from '@aws-sdk/client-s3';
import Fastify from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import * as dayjs from 'dayjs'
import * as dayjsUtc from 'dayjs/plugin/utc'
import * as dayjsTimezone from 'dayjs/plugin/timezone'
import * as ics from 'ics'
import { createHash } from 'node:crypto';
import * as env from 'env-var'

import { NichiyakuEventToJson } from 'scper-pre_processor/src/nichiyaku/event'

dayjs.extend(dayjsUtc)
dayjs.extend(dayjsTimezone)

const s3 = new S3.S3Client({
  region: 'auto',
  endpoint: env.get('S3_ENDPOINT').required().asString(),
  credentials: {
    accessKeyId: env.get('S3_ACCESS_KEY').required().asString(),
    secretAccessKey: env.get('S3_SECRET_ACCESS_KEY').required().asString(),
  },
});

const fastify = Fastify().withTypeProvider<TypeBoxTypeProvider>()

fastify.get('/_healthcheck', async (request, reply) => {
  reply.status(200).send()
})

fastify.get<{
  Params: {
    schoolId: string
  }
  Reply: Record<string, string[]>
}>('/:schoolId/lessonNames.json', {
  schema: {
    params: {
      schoolName: { type: 'string' },
    },
  }
}, async (request, reply) => {
  const objectParams = {
    Bucket: 'scper',
    Key: `${request.params.schoolId}/schedule.json`,
  };

  let scheduleData: NichiyakuEventToJson[]
  try {
    console.log(`Fetching previous schedule data from Cloudflare R2. Object key:${objectParams.Key}`);
    const getObjectCommand = new S3.GetObjectCommand(objectParams);
    const getObjectResponse = await s3.send(getObjectCommand);
    const originalData = await getObjectResponse.Body.transformToString();

    scheduleData = JSON.parse(originalData);
  } catch (err) {
    if (err.name !== 'NoSuchKey') {
      console.error(err)

      reply.status(500).send()

      return
    };

    reply.status(404).send()

    return
  }

  const listOfLessonByGrade: Record<
    string, // 学年
    string[]
  > = {}

  scheduleData.forEach(event => {
    if (event.type !== 'lecture') return

    if (event.schoolGrade in listOfLessonByGrade === false) listOfLessonByGrade[event.schoolGrade] = []

    if (listOfLessonByGrade[event.schoolGrade].includes(event.subject) === false) {
      listOfLessonByGrade[event.schoolGrade].push(event.subject)
    }
  })

  return listOfLessonByGrade
});

fastify.get<{
  Params: {
    schoolId: string
  }
  Querystring: {
    types: string[]
    lessonNames: string[]
    schoolGrade: number
  }
  Reply: string
}>('/:schoolId/schedule.ics', {
  schema: {
    params: {
      schoolName: { type: 'string' },
    },
    querystring: {
      type: 'object',
      properties: {
        types: { type: 'array', items: { type: 'string' } },
        lessonNames: { type: 'array', items: { type: 'string' } },
        schoolGrade: { type: 'number' }
      },
      required: ['types', 'lessonNames', 'schoolGrade'],
    }
  }
}, async (request, reply) => {
  const objectParams = {
    Bucket: 'scper',
    Key: `${request.params.schoolId}/schedule.json`,
  };

  let scheduleData: NichiyakuEventToJson[]
  try {
    console.log(`Fetching previous schedule data from Cloudflare R2. Object key:${objectParams.Key}`);
    const getObjectCommand = new S3.GetObjectCommand(objectParams);
    const getObjectResponse = await s3.send(getObjectCommand);
    const originalData = await getObjectResponse.Body.transformToString();

    scheduleData = JSON.parse(originalData);
  } catch (err) {
    if (err.name !== 'NoSuchKey') {
      console.error(err)

      reply.status(500).send()

      return
    };

    reply.status(404).send()

    return
  }

  const jsonToIcsProcessData = scheduleData
    .filter((event) =>
      request.query.types.includes(event.type) &&
      (
        event.type === 'waiting room' ||
        (
          event.schoolGrade === request.query.schoolGrade &&
          (
            event.type === 'event' ||
            (
              event.type === 'lecture' &&
              request.query.lessonNames.some(lessonName => event.subject.startsWith(lessonName))
            )
          )
        )
      )
    )
    .map((event) => {
      const startDateTime = dayjs(event.dateTime.start).utc()
      const endDateTime = dayjs(event.dateTime.end).utc()

      let title =
        event.type === 'event'
          ? event.subject
          : event.type === 'lecture'
            ? event.subject
            : event.type === 'waiting room'
              ? '学生控室'
              : '不明';
      title = `【${event.room}】${title}`;
      const description =
        event.type === 'lecture'
          ? `講義室：${event.room}\n教師：${event.teacher}`
          : undefined;

      const start: [number, number, number, number, number] = [
        startDateTime.year(),
        startDateTime.month() + 1,
        startDateTime.date(),
        startDateTime.hour(),
        startDateTime.minute(),
      ];
      const end: [number, number, number, number, number] = [
        endDateTime.year(),
        endDateTime.month() + 1,
        endDateTime.date(),
        endDateTime.hour(),
        endDateTime.minute(),
      ];

      return {
        uid: `${createHash('sha256').update(event.location + event.room + event.dateTime.start).digest('hex')}@scper.momizi.app`,
        productId: 'come25136/scper-api',
        title,
        description,
        startInputType: 'utc' as const,
        start: start,
        endInputType: 'utc' as const,
        end: end,
        location: `日本薬科大学 お茶の水キャンパス${event.location} ${event.room}`,
      };
    });

  const icsEvents = ics.createEvents(jsonToIcsProcessData);

  reply
    .type('text/calendar')
    .send(icsEvents.value);
});

fastify.listen({
  host: '0.0.0.0',
  port: env.get('PORT').default(3000).asPortNumber()
}, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  console.log(`Listening on ${address}`);
})
