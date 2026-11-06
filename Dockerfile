FROM quay.io/lyfe00011/md:beta
WORKDIR /root/LyFE/
COPY . .
RUN git init && git config user.email "bot@local" && git config user.name "bot" && git add . && git commit -m "build" --allow-empty
RUN npm install --legacy-peer-deps
CMD ["npm", "run", "docker"]
