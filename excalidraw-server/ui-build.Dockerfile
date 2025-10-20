FROM node:22 AS build

WORKDIR /home/node/app

COPY . .

RUN npm install
RUN cd excalidraw-app && npm run build:app:docker

FROM ubuntu:24.04
COPY --from=build /home/node/app/excalidraw-app/build /frontend

