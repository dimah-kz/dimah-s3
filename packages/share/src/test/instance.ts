import { DimahS3Db, db, migrate as migrateDb } from "@dimah-s3/db";
import { kyselyAdapter } from "@dimah-s3/db/adapters/kysely";
import { dbClient } from "@dimah-s3/db/client";
import { route, type DimahS3Config } from "@dimah-s3/server";
import { createTestInstance } from "@dimah-s3/server/testing";
import Database from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { shareClient } from "@/client/share-client";
import { DimahS3Share, SHARE_SCHEMA_VERSION } from "@/fuma-db";
import { migrate } from "@/migrate";
import { share } from "@/plugin/share";
import type { ShareOptions } from "@/types/options";

/** Options of {@link createShareTest}. */
export type ShareTestOptions = Omit<ShareOptions, "client"> & {
  /** db's `authorize`. */
  dbAuthorize?: Parameters<typeof db>[0]["authorize"];
  /** The instance guard. */
  guard?: DimahS3Config["guard"];
};

/**
 * A dimah-s3 instance on an in-memory S3, with `db()` and `share()` on one
 * SQLite database. The caller is `user:<x-user header>`; no header is no
 * session.
 */
export async function createShareTest(options: ShareTestOptions = {}) {
  const { dbAuthorize, guard, ...shareOptions } = options;
  const kysely = new Kysely<object>({
    dialect: new SqliteDialect({ database: new Database(":memory:") }),
  });
  const adapter = kyselyAdapter({ db: kysely, provider: "sqlite" });
  const dbFuma = DimahS3Db.client(adapter);
  await migrateDb(dbFuma);
  const shareFuma = DimahS3Share.client(adapter);
  await migrate(shareFuma);

  const instance = createTestInstance({
    ...(guard && { guard }),
    plugins: [
      db({
        client: dbFuma,
        resolveScope: ({ request }) => {
          const user = request.headers.get("x-user");
          return user ? `user:${user}` : null;
        },
        ...(dbAuthorize && { authorize: dbAuthorize }),
      }),
      share({
        client: shareFuma,
        url: (token) => `https://app.test/s/${token}`,
        ...shareOptions,
      }),
    ],
    clientPlugins: [dbClient(), shareClient()],
    routes: {
      files: route({ upload: true, download: true, delete: true }),
      proxied: route({
        upload: true,
        download: { mode: "proxy", maxExpiresIn: 60 },
      }),
      private: route({ upload: true }),
    },
  });

  /** Request options for a signed-in user. */
  const as = (user: string) => ({ headers: { "x-user": user } });

  return {
    ...instance,
    as,
    /** Uploads `name` as `user`, into `folderId` when set. Returns the key. */
    async put(
      user: string,
      name: string,
      body = "hello",
      extra: { route?: string; folderId?: string; type?: string } = {},
    ) {
      const { key } = await instance.upload(
        {
          route: extra.route ?? "files",
          name,
          body,
          type: extra.type ?? "text/plain",
          ...(extra.folderId !== undefined && {
            clientMetadata: { folderId: extra.folderId },
          }),
        },
        as(user),
      );
      return key;
    },
    /** Creates a folder as `user`. Returns its id. */
    async folder(user: string, name: string, parentId: string | null = null) {
      const { folder } = await instance.client.db.createFolder(
        { name, parentId },
        as(user),
      );
      return folder.id;
    },
    /** Writes columns of a link straight through the ORM. */
    async patchLink(id: string, values: { expiresAt?: Date }) {
      await shareFuma.orm(SHARE_SCHEMA_VERSION).updateMany("shareLink", {
        where: (b) => b("id", "=", id),
        set: values,
      });
    },
    close: () => kysely.destroy(),
  };
}
