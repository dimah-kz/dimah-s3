"use client";

import { useCallback, useId } from "react";
import { useFormatNumber } from "@dimah-s3/react";
import {
  SHARE_MAX_DOWNLOADS_LIMIT,
  type ShareClientLink,
  type ShareLinkSettingsInput,
} from "@dimah-s3/share/client";
import { useTranslations } from "@fuma-translate/react";
import { cn } from "cn";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";

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
    if (seconds !== undefined) {
      settings.expiresAt =
        seconds === null
          ? null
          : new Date(Date.now() + seconds * 1000).toISOString();
    }
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

const LABEL_CLASS = "text-xs text-dimah-s3-muted-foreground";

/**
 * The settings of a link: lifetime, password, download limit, and note.
 * For a new link, or, with `link`, for changing one. @internal
 */
export function ShareLinkFields({
  draft,
  onChange,
  expiryOptions,
  fields = {},
  link,
  disabled,
}: {
  draft: ShareLinkDraft;
  onChange: (draft: ShareLinkDraft) => void;
  expiryOptions: readonly (number | null)[];
  fields?: ShareLinkFieldsOptions;
  /** The link being changed. */
  link?: ShareClientLink;
  disabled?: boolean;
}) {
  const t = useTranslations();
  const duration = useShareDurationLabel();
  const id = useId();
  const set = (patch: Partial<ShareLinkDraft>) =>
    onChange({ ...draft, ...patch });
  const hasPassword = link?.passwordProtected === true;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={`${id}-expiry`} className={LABEL_CLASS}>
          {t("Expires after", { note: "share link field" })}
        </Label>
        <NativeSelect
          id={`${id}-expiry`}
          value={draft.expiry}
          disabled={disabled}
          className="w-full"
          onChange={(event) => set({ expiry: event.target.value })}
        >
          {link ? (
            <NativeSelectOption value="keep">
              {t("Keep the current expiry", { note: "share link field" })}
            </NativeSelectOption>
          ) : null}
          {expiryOptions.map((seconds, index) => (
            <NativeSelectOption key={seconds ?? "never"} value={String(index)}>
              {duration(seconds)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      {fields.maxDownloads !== false ? (
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={`${id}-limit`} className={LABEL_CLASS}>
            {t("Download limit", { note: "share link field" })}
          </Label>
          <Input
            id={`${id}-limit`}
            type="number"
            inputMode="numeric"
            min={1}
            max={SHARE_MAX_DOWNLOADS_LIMIT}
            step={1}
            value={draft.maxDownloads}
            disabled={disabled}
            placeholder={t("No limit", { note: "share link field" })}
            onChange={(event) => set({ maxDownloads: event.target.value })}
          />
        </div>
      ) : null}
      {fields.password !== false ? (
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={`${id}-password`} className={LABEL_CLASS}>
            {hasPassword
              ? t("New password", { note: "share link field" })
              : t("Password", { note: "share link field" })}
          </Label>
          <Input
            id={`${id}-password`}
            type="password"
            autoComplete="new-password"
            value={draft.password}
            disabled={disabled || draft.removePassword}
            placeholder={
              hasPassword
                ? t("Keep the current password", { note: "share link field" })
                : t("Optional", { note: "share link field" })
            }
            onChange={(event) => set({ password: event.target.value })}
          />
          {hasPassword ? (
            <Label className={cn(LABEL_CLASS, "font-normal")}>
              <Checkbox
                checked={draft.removePassword}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  set({ removePassword: checked, password: "" })
                }
              />
              {t("Remove the password", { note: "share link field" })}
            </Label>
          ) : null}
        </div>
      ) : null}
      {fields.label !== false ? (
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={`${id}-label`} className={LABEL_CLASS}>
            {t("Note", { note: "share link field" })}
          </Label>
          <Input
            id={`${id}-label`}
            type="text"
            maxLength={255}
            autoComplete="off"
            value={draft.label}
            disabled={disabled}
            placeholder={t("Who the link is for", {
              note: "share link field",
            })}
            onChange={(event) => set({ label: event.target.value })}
          />
        </div>
      ) : null}
    </div>
  );
}
