import type { S3Api } from "@dimah-s3/core";
import { errors } from "./errors";
import { requestFromHeaders, runHook } from "./internal-helpers";
import { PROCEDURE_REGISTRY } from "./procedures/registry";
import type { DimahS3Config } from "./types";

async function runProcedure<T>(
  config: DimahS3Config,
  entry: (typeof PROCEDURE_REGISTRY)[keyof typeof PROCEDURE_REGISTRY],
  headers: HeadersInit | undefined,
  input: unknown,
): Promise<T> {
  const request = requestFromHeaders(headers);
  await runHook(config.guard, { request });

  if (!entry.isEnabled(config)) {
    throw errors.notFound();
  }

  return entry.run(config, input, request) as Promise<T>;
}

/** Direct `S3Api` backed by the same procedures as the HTTP handler. */
export function createServerApi(config: DimahS3Config): S3Api {
  return {
    upload: (payload) => {
      const { headers, ...input } = payload;
      return runProcedure(config, PROCEDURE_REGISTRY.upload, headers, input);
    },

    confirm: (payload) => {
      const { headers, ...input } = payload;
      return runProcedure(
        config,
        PROCEDURE_REGISTRY.uploadConfirm,
        headers,
        input,
      );
    },

    download: (key, options) => {
      const { headers, ...rest } = options ?? {};
      return runProcedure(config, PROCEDURE_REGISTRY.download, headers, {
        key,
        ...rest,
      });
    },

    delete: (key, options) => {
      const { headers, ...rest } = options ?? {};
      return runProcedure(config, PROCEDURE_REGISTRY.delete, headers, {
        key,
        ...rest,
      });
    },

    multipart: {
      init: (payload) => {
        const { headers, ...input } = payload;
        return runProcedure(
          config,
          PROCEDURE_REGISTRY.multipartInit,
          headers,
          input,
        );
      },

      signPart: (payload) => {
        const { headers, ...input } = payload;
        return runProcedure(
          config,
          PROCEDURE_REGISTRY.multipartPart,
          headers,
          input,
        );
      },

      listParts: (payload) => {
        const { headers, ...input } = payload;
        return runProcedure(
          config,
          PROCEDURE_REGISTRY.multipartListParts,
          headers,
          input,
        );
      },

      complete: (payload) => {
        const { headers, ...input } = payload;
        return runProcedure(
          config,
          PROCEDURE_REGISTRY.multipartComplete,
          headers,
          input,
        );
      },

      abort: (payload) => {
        const { headers, ...input } = payload;
        return runProcedure(
          config,
          PROCEDURE_REGISTRY.multipartAbort,
          headers,
          input,
        );
      },
    },
  };
}
