# scper

scper は、時間割の PDF ファイルを JSON 形式に変換する pre_processor と、JSON を ICE 形式に変換する API を提供する API があります。

## pre_processor

pre_processor は、時間割の PDF ファイルを解析し、JSON 形式に変換します。変換された JSON データには、以下の情報が含まれます。

| 項目        | 型                                      | 説明               |
| ----------- | --------------------------------------- | ------------------ |
| type        | "event" \| "lesson" \| "waiting room"   |                    |
| location    | string                                  | 行われる施設名等   |
| room        | string                                  | 講義室名           |
| time        | number                                  | n 時限目           |
| subject     | string                                  | イベント名, 講義名 |
| schoolGrade | number                                  | 学年               |
| dateTime    | { "start": "ISO8601", "end":"ISO8601" } | 日時               |

pre_processor は、以下の手順で使用できます。

1. 時間割の PDF ファイルを Google Drive にアップロードします。(手動)
2. アップロードされた PDF ファイルを解析し、JSON データを生成します。
3. 生成された JSON データを S3 にアップロードします。

## API

API は、JSON 形式の時間割データを ICE 形式に変換します。  
ICE 形式の時間割データは、スケジュール管理アプリなどで使用することができます。

## メモ

API は pre_processor に依存しているため、Dockerfile がルートにないと pre_processor ファイルが COPY 出来ない
