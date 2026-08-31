"use client";

import { useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import {
  BRAND_FONT_OPTIONS,
  BRAND_LOGO_ALLOWED_MIME_TYPES,
  BRAND_LOGO_MAX_BYTES,
} from "@/services/identity/brandIdentity";

const fieldClassName =
  "rounded-2xl border border-white/15 bg-white/[0.04] px-5 py-4 text-sm text-white/90 shadow-inner shadow-black/20 outline-none placeholder:text-white/30 focus:border-[var(--athena-orange)] focus:ring-1 focus:ring-[var(--athena-orange)]";

type BrandMessages = {
  eyebrow: string;
  title: string;
  description: string;
  logo: string;
  logoHelp: string;
  logoPreviewAlt: string;
  noLogo: string;
  uploading: string;
  replaceLogo: string;
  uploadLogo: string;
  removeLogo: string;
  removeLogoConfirm: string;
  profilePicture: string;
  profilePictureHelp: string;
  profilePreviewAlt: string;
  noPicture: string;
  replacePicture: string;
  uploadPicture: string;
  removePicture: string;
  removePictureConfirm: string;
  colorPalette: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  colorPickerAria: string;
  typography: string;
  clientFont: string;
  save: string;
  saving: string;
  invalidImageType: string;
  logoTooLarge: string;
  pictureTooLarge: string;
  uploadLogoFailed: string;
  removeLogoFailed: string;
  uploadPictureFailed: string;
  removePictureFailed: string;
};

const DEFAULT_BRAND_MESSAGES: BrandMessages = {
  eyebrow: "Brand Identity",
  title: "Client Brand Identity",
  description:
    "Store the visual identity Athena may use for future branded content and publishing workflows.",
  logo: "Logo",
  logoHelp: "PNG, JPEG, or WebP. Maximum 2 MB.",
  logoPreviewAlt: "Client logo preview",
  noLogo: "No logo",
  uploading: "Uploading…",
  replaceLogo: "Replace logo",
  uploadLogo: "Upload logo",
  removeLogo: "Remove logo",
  removeLogoConfirm: "Remove the client logo?",
  profilePicture: "Profile Picture",
  profilePictureHelp: "PNG, JPEG, or WebP. Maximum 2 MB.",
  profilePreviewAlt: "Client profile picture preview",
  noPicture: "No picture",
  replacePicture: "Replace picture",
  uploadPicture: "Upload picture",
  removePicture: "Remove picture",
  removePictureConfirm: "Remove the profile picture?",
  colorPalette: "Color Palette",
  primaryColor: "Primary Color",
  secondaryColor: "Secondary Color",
  accentColor: "Accent Color",
  backgroundColor: "Background Color",
  colorPickerAria: "{label} color picker",
  typography: "Typography",
  clientFont: "Client Font",
  save: "Save Brand Identity",
  saving: "Saving…",
  invalidImageType: "Use a PNG, JPEG, or WebP image.",
  logoTooLarge: "Logo must be 2 MB or smaller.",
  pictureTooLarge: "Profile picture must be 2 MB or smaller.",
  uploadLogoFailed: "Could not upload logo.",
  removeLogoFailed: "Could not remove logo.",
  uploadPictureFailed: "Could not upload profile picture.",
  removePictureFailed: "Could not remove profile picture.",
};

type BrandIdentitySectionProps = {
  initialPrimaryColor: string;
  initialSecondaryColor: string;
  initialAccentColor: string;
  initialBackgroundColor: string;
  initialFont: string;
  initialLogoPreviewUrl: string | null;
  initialProfilePicturePreviewUrl: string | null;
  saveBrandIdentity: (formData: FormData) => Promise<void>;
  brandError?: string | null;
  messages?: BrandMessages;
};

type ColorFieldProps = {
  label: string;
  name: string;
  value: string;
  onChange: (next: string) => void;
  inputId: string;
  pickerAria: string;
};

function ColorField({
  label,
  name,
  value,
  onChange,
  inputId,
  pickerAria,
}: ColorFieldProps) {
  const pickerValue =
    /^#[0-9A-Fa-f]{6}$/.test(value.trim()) ? value.trim() : "#000000";

  return (
    <label className="grid gap-2" htmlFor={inputId}>
      <span className="text-sm font-medium text-white/80">{label}</span>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="color"
          aria-label={pickerAria}
          value={pickerValue}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="h-11 w-14 cursor-pointer rounded-lg border border-white/15 bg-transparent p-1"
        />
        <input
          id={inputId}
          name={name}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`min-w-[10rem] flex-1 font-mono uppercase ${fieldClassName}`}
          placeholder="#FF6600"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
    </label>
  );
}

function SaveBrandButton({
  saveLabel,
  savingLabel,
}: {
  saveLabel: string;
  savingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-fit items-center justify-center rounded-full bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-60"
    >
      {pending ? savingLabel : saveLabel}
    </button>
  );
}

export function BrandIdentitySection({
  initialPrimaryColor,
  initialSecondaryColor,
  initialAccentColor,
  initialBackgroundColor,
  initialFont,
  initialLogoPreviewUrl,
  initialProfilePicturePreviewUrl,
  saveBrandIdentity,
  brandError = null,
  messages = DEFAULT_BRAND_MESSAGES,
}: BrandIdentitySectionProps) {
  const router = useRouter();
  const baseId = useId();
  const [primaryColor, setPrimaryColor] = useState(initialPrimaryColor);
  const [secondaryColor, setSecondaryColor] = useState(initialSecondaryColor);
  const [accentColor, setAccentColor] = useState(initialAccentColor);
  const [backgroundColor, setBackgroundColor] = useState(
    initialBackgroundColor,
  );
  const [font, setFont] = useState(initialFont);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState(initialLogoPreviewUrl);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [profilePicturePreviewUrl, setProfilePicturePreviewUrl] = useState(
    initialProfilePicturePreviewUrl,
  );
  const [profilePictureError, setProfilePictureError] = useState<string | null>(
    null,
  );
  const [profilePictureBusy, setProfilePictureBusy] = useState(false);

  async function handleLogoUpload(file: File | null) {
    if (!file) return;
    setLogoError(null);

    if (
      !BRAND_LOGO_ALLOWED_MIME_TYPES.includes(
        file.type as (typeof BRAND_LOGO_ALLOWED_MIME_TYPES)[number],
      )
    ) {
      setLogoError(messages.invalidImageType);
      return;
    }
    if (file.size > BRAND_LOGO_MAX_BYTES) {
      setLogoError(messages.logoTooLarge);
      return;
    }

    setLogoBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/identity/brand-logo", {
        method: "POST",
        body,
      });
      const payload = await parseJsonResponse<{
        ok?: boolean;
        previewUrl?: string | null;
        error?: { message?: string };
      }>(response);

      if (!response.ok || !payload.ok) {
        setLogoError(payload.error?.message ?? messages.uploadLogoFailed);
        return;
      }

      setLogoPreviewUrl(payload.previewUrl ?? null);
      router.refresh();
    } catch {
      setLogoError(messages.uploadLogoFailed);
    } finally {
      setLogoBusy(false);
    }
  }

  async function handleLogoRemove() {
    if (!logoPreviewUrl) return;
    const confirmed = window.confirm(messages.removeLogoConfirm);
    if (!confirmed) return;

    setLogoError(null);
    setLogoBusy(true);
    try {
      const response = await fetch("/api/identity/brand-logo", {
        method: "DELETE",
      });
      const payload = await parseJsonResponse<{
        ok?: boolean;
        error?: { message?: string };
      }>(response);

      if (!response.ok || !payload.ok) {
        setLogoError(payload.error?.message ?? messages.removeLogoFailed);
        return;
      }

      setLogoPreviewUrl(null);
      router.refresh();
    } catch {
      setLogoError(messages.removeLogoFailed);
    } finally {
      setLogoBusy(false);
    }
  }

  async function handleProfilePictureUpload(file: File | null) {
    if (!file) return;
    setProfilePictureError(null);

    if (
      !BRAND_LOGO_ALLOWED_MIME_TYPES.includes(
        file.type as (typeof BRAND_LOGO_ALLOWED_MIME_TYPES)[number],
      )
    ) {
      setProfilePictureError(messages.invalidImageType);
      return;
    }
    if (file.size > BRAND_LOGO_MAX_BYTES) {
      setProfilePictureError(messages.pictureTooLarge);
      return;
    }

    setProfilePictureBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/identity/profile-picture", {
        method: "POST",
        body,
      });
      const payload = await parseJsonResponse<{
        ok?: boolean;
        previewUrl?: string | null;
        error?: { message?: string };
      }>(response);

      if (!response.ok || !payload.ok) {
        setProfilePictureError(
          payload.error?.message ?? messages.uploadPictureFailed,
        );
        return;
      }

      setProfilePicturePreviewUrl(payload.previewUrl ?? null);
      router.refresh();
    } catch {
      setProfilePictureError(messages.uploadPictureFailed);
    } finally {
      setProfilePictureBusy(false);
    }
  }

  async function handleProfilePictureRemove() {
    if (!profilePicturePreviewUrl) return;
    const confirmed = window.confirm(messages.removePictureConfirm);
    if (!confirmed) return;

    setProfilePictureError(null);
    setProfilePictureBusy(true);
    try {
      const response = await fetch("/api/identity/profile-picture", {
        method: "DELETE",
      });
      const payload = await parseJsonResponse<{
        ok?: boolean;
        error?: { message?: string };
      }>(response);

      if (!response.ok || !payload.ok) {
        setProfilePictureError(
          payload.error?.message ?? messages.removePictureFailed,
        );
        return;
      }

      setProfilePicturePreviewUrl(null);
      router.refresh();
    } catch {
      setProfilePictureError(messages.removePictureFailed);
    } finally {
      setProfilePictureBusy(false);
    }
  }

  function colorPickerAria(label: string) {
    return interpolateTenantMessage(messages.colorPickerAria, { label });
  }

  return (
    <section className="mt-8 rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
      <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
        {messages.eyebrow}
      </div>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">
        {messages.title}
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">
        {messages.description}
      </p>

      <div className="mt-8 grid gap-10">
        <div className="grid gap-4">
          <h3 className="text-xl font-semibold text-white">{messages.logo}</h3>
          <p className="text-sm text-white/45">{messages.logoHelp}</p>
          {logoPreviewUrl ? (
            <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoPreviewUrl}
                alt={messages.logoPreviewAlt}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          ) : (
            <div className="flex h-28 w-28 items-center justify-center rounded-2xl border border-dashed border-white/15 bg-black/20 text-xs text-white/35">
              {messages.noLogo}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center rounded-xl border border-[var(--athena-orange)]/30 bg-[var(--athena-orange)]/10 px-4 py-2 text-sm font-medium text-[var(--athena-orange)] transition hover:bg-[var(--athena-orange)]/20">
              <span>
                {logoBusy
                  ? messages.uploading
                  : logoPreviewUrl
                    ? messages.replaceLogo
                    : messages.uploadLogo}
              </span>
              <input
                type="file"
                accept={BRAND_LOGO_ALLOWED_MIME_TYPES.join(",")}
                className="sr-only"
                disabled={logoBusy}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  event.target.value = "";
                  void handleLogoUpload(file);
                }}
              />
            </label>
            {logoPreviewUrl ? (
              <button
                type="button"
                disabled={logoBusy}
                onClick={() => void handleLogoRemove()}
                className="rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2 text-sm text-white/70 transition hover:bg-white/[0.08] disabled:opacity-50"
              >
                {messages.removeLogo}
              </button>
            ) : null}
          </div>
          {logoError ? (
            <p className="text-sm text-rose-300/90" role="alert">
              {logoError}
            </p>
          ) : null}
        </div>

        <div className="grid gap-4">
          <h3 className="text-xl font-semibold text-white">
            {messages.profilePicture}
          </h3>
          <p className="text-sm text-white/45">{messages.profilePictureHelp}</p>
          {profilePicturePreviewUrl ? (
            <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-black/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={profilePicturePreviewUrl}
                alt={messages.profilePreviewAlt}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div className="flex h-28 w-28 items-center justify-center rounded-full border border-dashed border-white/15 bg-black/20 text-xs text-white/35">
              {messages.noPicture}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center rounded-xl border border-[var(--athena-orange)]/30 bg-[var(--athena-orange)]/10 px-4 py-2 text-sm font-medium text-[var(--athena-orange)] transition hover:bg-[var(--athena-orange)]/20">
              <span>
                {profilePictureBusy
                  ? messages.uploading
                  : profilePicturePreviewUrl
                    ? messages.replacePicture
                    : messages.uploadPicture}
              </span>
              <input
                type="file"
                accept={BRAND_LOGO_ALLOWED_MIME_TYPES.join(",")}
                className="sr-only"
                disabled={profilePictureBusy}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  event.target.value = "";
                  void handleProfilePictureUpload(file);
                }}
              />
            </label>
            {profilePicturePreviewUrl ? (
              <button
                type="button"
                disabled={profilePictureBusy}
                onClick={() => void handleProfilePictureRemove()}
                className="rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2 text-sm text-white/70 transition hover:bg-white/[0.08] disabled:opacity-50"
              >
                {messages.removePicture}
              </button>
            ) : null}
          </div>
          {profilePictureError ? (
            <p className="text-sm text-rose-300/90" role="alert">
              {profilePictureError}
            </p>
          ) : null}
        </div>

        <form action={saveBrandIdentity} className="grid gap-8">
          <div className="grid gap-4">
            <h3 className="text-xl font-semibold text-white">
              {messages.colorPalette}
            </h3>
            <div className="grid gap-5 sm:grid-cols-2">
              <ColorField
                label={messages.primaryColor}
                name="brand_primary_color"
                value={primaryColor}
                onChange={setPrimaryColor}
                inputId={`${baseId}-primary`}
                pickerAria={colorPickerAria(messages.primaryColor)}
              />
              <ColorField
                label={messages.secondaryColor}
                name="brand_secondary_color"
                value={secondaryColor}
                onChange={setSecondaryColor}
                inputId={`${baseId}-secondary`}
                pickerAria={colorPickerAria(messages.secondaryColor)}
              />
              <ColorField
                label={messages.accentColor}
                name="brand_accent_color"
                value={accentColor}
                onChange={setAccentColor}
                inputId={`${baseId}-accent`}
                pickerAria={colorPickerAria(messages.accentColor)}
              />
              <ColorField
                label={messages.backgroundColor}
                name="brand_background_color"
                value={backgroundColor}
                onChange={setBackgroundColor}
                inputId={`${baseId}-background`}
                pickerAria={colorPickerAria(messages.backgroundColor)}
              />
            </div>
          </div>

          <div className="grid gap-4">
            <h3 className="text-xl font-semibold text-white">
              {messages.typography}
            </h3>
            <label className="grid gap-2" htmlFor={`${baseId}-font`}>
              <span className="text-sm font-medium text-white/80">
                {messages.clientFont}
              </span>
              <select
                id={`${baseId}-font`}
                name="brand_font"
                value={font}
                onChange={(event) => setFont(event.target.value)}
                className={fieldClassName}
              >
                {BRAND_FONT_OPTIONS.map((option) => (
                  <option key={option.value || "none"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {brandError ? (
            <p className="text-sm text-rose-300/90" role="alert">
              {brandError}
            </p>
          ) : null}

          <SaveBrandButton
            saveLabel={messages.save}
            savingLabel={messages.saving}
          />
        </form>
      </div>
    </section>
  );
}
