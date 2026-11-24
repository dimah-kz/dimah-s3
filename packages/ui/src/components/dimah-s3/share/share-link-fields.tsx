"use client";

import { useCallback, useId } from "react";
import { useFormatNumber } from "@dimah-s3/react";
import {
  SHARE_LABEL_MAX_LENGTH,
  SHARE_MAX_DOWNLOADS_LIMIT,
  SHARE_PASSWORD_MAX_LENGTH,
  type ShareClientLink,
  type ShareLinkSettingsInput,
} from "@dimah-s3/share/client";
import { useTranslations } from "@fuma-translate/react";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Lifetimes a new link offers by default, in seconds: 1, 7, and 30 days. */
export const DEFAULT_SHARE_EXPIRY_OPTIONS: readonly (number | null)[] = [
  86_400, 604_800, 2_592_000,
];

/** Which optional fields the form shows. Each is on unless set to `false`. */
export type ShareLinkFieldsOptions = {
  /** A password visitors enter first. */
  password?: boolean;
  /** A download limit. */
  maxDownloads?: boolean;
  /** The owner's note, such as who the link is for. */
  label?: boolean;
};

/** What the form holds, as typed. @internal */
export type ShareLinkDraft = {
  /** An index into the expiry options, or `keep` while changing a link. */
  expiry: string;
  password: string;
  /** While changing a link that has a password: clear it. */
  removePassword: boolean;
  maxDownloads: string;
  label: string;
};

/** The form for a new link: the first lifetime, nothing else. @internal */
export function newLinkDraft(): ShareLinkDraft {
  return {
    expiry: "0",
    password: "",
    removePassword: false,
    maxDownloads: "",
    label: "",
  };
}

/** The form for changing `link`: its settings, and its expiry kept. @internal */
export function linkDraft(link: ShareClientLink): ShareLinkDraft {
  return {
    expiry: "keep",
    password: "",
    removePassword: false,
    maxDownloads: link.maxDownloads === null ? "" : String(link.maxDownloads),
    label: link.label ?? "",
  };
}

/**
 * The settings a draft asks for. With `link`, only the fields that change:
 * an empty password keeps the current one. @internal
 */
export function draftSettings(
  draft: ShareLinkDraft,
  expiryOptions: readonly (number | null)[],
  link?: ShareClientLink,
): ShareLinkSettingsInput {
  const settings: ShareLinkSettingsInput = {};
  if (draft.expiry !== "keep") {
    const seconds = expiryOptions[Number(draft.expiry)];
    // A lifetime, so the server's clock sets the date: a browser clock
    // that runs ahead cannot push the longest option past `expiration.max`.
    if (seconds === null) settings.expiresAt = null;
    else if (seconds !== undefined) settings.expiresIn = Math.round(seconds);
  }
  const limit = draft.maxDownloads.trim();
  const maxDownloads = limit === "" ? null : Number(limit);
  if (!link || maxDownloads !== link.maxDownloads) {
    settings.maxDownloads = maxDownloads;
  }
  const label = draft.label.trim() === "" ? null : draft.label.trim();
  if (!link || label !== link.label) settings.label = label;
  if (draft.removePassword) settings.password = null;
  else if (draft.password !== "") settings.password = draft.password;
  return settings;
}

/** "7 days" for a lifetime in seconds; "Never expires" for `null`. @internal */
export function useShareDurationLabel(): (seconds: number | null) => string {
  const t = useTranslations();
  const formatNumber = useFormatNumber();
  return useCallback(
    (seconds: number | null) => {
      if (seconds === null) {
        return t("Never expires", { note: "share link expiry" });
      }
      const safe = Math.max(60, Math.round(seconds));
      if (safe >= 86_400 && safe % 86_400 === 0) {
        const count = safe / 86_400;
        return count === 1
          ? t("1 day", { note: "share link expiry" })
          : t("{count} days", {
              note: "share link expiry",
              variables: { count: formatNumber(count) },
            });
      }
      if (safe >= 3600) {
        const count = Math.round(safe / 3600);
        return count === 1
          ? t("1 hour", { note: "share link expiry" })
          : t("{count} hours", {
              note: "share link expiry",
              variables: { count: formatNumber(count) },
            });
      }
      const count = Math.round(safe / 60);
      return count === 1
        ? t("1 minute", { note: "share link expiry" })
        : t("{count} minutes", {
            note: "share link expiry",
            variables: { count: formatNumber(count) },
          });
    },
    [t, formatNumber],
  );
}

/**
 * The settings of a link: lifetime, password, download limit, and note.
 * For a new link, or, with `link`, for changing one. While `pending`, the
 * text fields turn read-only rather than disabled, so the one that sent
 * the form with Enter keeps focus. @internal
 */
export function ShareLinkFields({
  draft,
  onChange,
  expiryOptions,
  fields = {},
  link,
  pending = false,
}: {
  draft: ShareLinkDraft;
  onChange: (draft: ShareLinkDraft) => void;
  expiryOptions: readonly (number | null)[];
  fields?: ShareLinkFieldsOptions;
  /** The link being changed. */
  link?: ShareClientLink;
  /** True while the form is being sent. */
  pending?: boolean;
}) {
  const t = useTranslations();
  const duration = useShareDurationLabel();
  const id = useId();
  const set = (patch: Partial<ShareLinkDraft>) =>
    onChange({ ...draft, ...patch });
  const hasPassword = link?.passwordProtected === true;

  const expiryItems = [
    ...(link
      ? [
          {
            value: "keep",
            label: t("Keep the current expiry", { note: "share link field" }),
          },
        ]
      : []),
    ...expiryOptions.map((seconds, index) => ({
      value: String(index),
      label: duration(seconds),
    })),
  ];

  return (
    <FieldGroup className="grid gap-3 sm:grid-cols-2">
      <Field>
        <FieldLabel htmlFor={`${id}-expiry`}>
          {t("Expires after", { note: "share link field" })}
        </FieldLabel>
        <Select
          items={expiryItems}
          value={draft.expiry}
          disabled={pending}
          onValueChange={(value) => {
            if (typeof value === "string") set({ expiry: value });
          }}
        >
          <SelectTrigger id={`${id}-expiry`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {expiryItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {fields.maxDownloads !== false ? (
        <Field>
          <FieldLabel htmlFor={`${id}-limit`}>
            {t("Download limit", { note: "share link field" })}
          </FieldLabel>
          <Input
            id={`${id}-limit`}
            type="number"
            inputMode="numeric"
            min={1}
            max={SHARE_MAX_DOWNLOADS_LIMIT}
            step={1}
            value={draft.maxDownloads}
            readOnly={pending}
            placeholder={t("No limit", { note: "share link field" })}
            onChange={(event) => set({ maxDownloads: event.target.value })}
          />
        </Field>
      ) : null}
      {fields.password !== false ? (
        <Field>
          <FieldLabel htmlFor={`${id}-password`}>
            {hasPassword
              ? t("New password", { note: "share link field" })
              : t("Password", { note: "share link field" })}
          </FieldLabel>
          <Input
            id={`${id}-password`}
            type="password"
            autoComplete="new-password"
            maxLength={SHARE_PASSWORD_MAX_LENGTH}
            value={draft.password}
            readOnly={pending}
            disabled={draft.removePassword}
            placeholder={
              hasPassword
                ? t("Keep the current password", { note: "share link field" })
                : t("Optional", { note: "share link field" })
            }
            onChange={(event) => set({ password: event.target.value })}
          />
          {hasPassword ? (
            <Field orientation="horizontal">
              <Checkbox
                id={`${id}-remove-password`}
                checked={draft.removePassword}
                disabled={pending}
                onCheckedChange={(checked) =>
                  set({ removePassword: checked, password: "" })
                }
              />
              <FieldLabel
                htmlFor={`${id}-remove-password`}
                className="font-normal"
              >
                {t("Remove the password", { note: "share link field" })}
              </FieldLabel>
            </Field>
          ) : null}
        </Field>
      ) : null}
      {fields.label !== false ? (
        <Field>
          <FieldLabel htmlFor={`${id}-label`}>
            {t("Note", { note: "share link field" })}
          </FieldLabel>
          <Input
            id={`${id}-label`}
            type="text"
            maxLength={SHARE_LABEL_MAX_LENGTH}
            autoComplete="off"
            value={draft.label}
            readOnly={pending}
            placeholder={t("Who the link is for", {
              note: "share link field",
            })}
            onChange={(event) => set({ label: event.target.value })}
          />
        </Field>
      ) : null}
    </FieldGroup>
  );
}
