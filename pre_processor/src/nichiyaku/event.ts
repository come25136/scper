import { Dayjs } from "dayjs";

interface Common {
  type: string;
  date: Dayjs
  location: string
  room: string
  time: 1 | 2 | 3 | 4
}

interface NichiyakuLecture extends Common {
  type: 'lecture';
  lectureMethod: 'face-to-face' | 'live' | 'video';
  subject: string;
  teacher: string;
  schoolGrade: number;
}

interface _NichiyakuEvent extends Common {
  type: 'event';
  subject: string;
  schoolGrade: number;
}

interface NichiyakuWaitingRoom extends Common {
  type: 'waiting room';
}

export type NichiyakuEvent = NichiyakuLecture | _NichiyakuEvent | NichiyakuWaitingRoom
export type NichiyakuEventToJson = (Omit<NichiyakuLecture, 'date' | 'time'> | Omit<_NichiyakuEvent, 'date' | 'time'> | Omit<NichiyakuWaitingRoom, 'date' | 'time'>) & {
  dateTime: {
    start: string // ISO8601
    end: string // ISO8601
  }
};
