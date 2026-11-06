FROM quay.io/lyfe00011/md:beta
ARG RAILWAY_GIT_COMMIT_SHA
RUN echo "$RAILWAY_GIT_COMMIT_SHA" && git clone https://github.com/sammy-XXIV/levanter.git /root/LyFE/
WORKDIR /root/LyFE/
RUN yarn install
COPY index.js ./index.js
COPY lib/fork-compat.js ./lib/fork-compat.js
RUN ln -s /data/database.db database.db
CMD ["npm", "run", "docker"]
