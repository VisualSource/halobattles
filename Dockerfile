FROM node:latest

COPY ./build /

CMD ["node","./dist/runtime/index.js"]