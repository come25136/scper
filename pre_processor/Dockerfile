# ビルド用のイメージ
FROM node:18.15.0-alpine3.17 AS build

# ライブラリのインストール
RUN apk add --no-cache \
    build-base \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev \
    pangomm-dev \
    libjpeg-turbo-dev \
    freetype-dev

# Node.jsアプリケーションを配置するディレクトリを作成
WORKDIR /app

# アプリケーションに必要なパッケージをインストール
COPY package.json .
COPY package-lock.json .

RUN npm ci

# アプリケーションファイルをコピー
COPY . .

# アプリケーションをビルド
RUN npm run build

# 実行用のイメージ
FROM node:18.15.0-alpine3.17

# ライブラリのインストール
RUN apk add --no-cache \
    cairo \
    jpeg \
    pango \
    giflib \
    pixman \
    pangomm \
    libjpeg-turbo \
    freetype

# Node.jsアプリケーションを配置するディレクトリを作成
WORKDIR /app

# アプリケーションファイルをコピー
COPY --from=build /app/package.json .
COPY --from=build /app/package-lock.json .
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/dist dist

# アプリケーションを実行
CMD [ "npm", "start" ]
