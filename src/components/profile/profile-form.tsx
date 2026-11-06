"use client";

import { Camera, Trash2 } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useAppState } from "@/components/providers/app-state-provider";
import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { friendlyError } from "@/lib/domain/errors";
import { BIO_MAX, displayNameSchema } from "@/lib/domain/validation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const MAX_INPUT_BYTES = 10 * 1024 * 1024;

/** Square-crops and downsizes an image in the browser so avatars stay small (<2 MB, 512px). */
async function toAvatarBlob(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const size = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.min(512, size);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bitmap, (bitmap.width - size) / 2, (bitmap.height - size) / 2, size, size, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Encoding failed"))), "image/webp", 0.86),
  );
}

export function ProfileForm({ submitLabel = "Save profile", onSaved }: { submitLabel?: string; onSaved?: () => void }) {
  const supabase = getSupabaseBrowserClient();
  const { state, refresh } = useAppState();
  const fileRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState(state.profile.display_name);
  const [bio, setBio] = useState(state.profile.bio ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = displayNameSchema.safeParse(displayName);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Invalid display name.");
    setError(null);
    setSaving(true);
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ display_name: parsed.data, bio: bio.trim() ? bio.trim() : null })
      .eq("id", state.profile.id);
    setSaving(false);
    if (updateError) return setError(friendlyError(updateError));
    toast.success("Profile saved.");
    await refresh();
    onSaved?.();
  }

  async function setAvatar(path: string | null) {
    const previous = state.profile.avatar_path;
    const { error: updateError } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", state.profile.id);
    if (updateError) throw updateError;
    if (previous && previous !== path) await supabase.storage.from("avatars").remove([previous]);
    await refresh();
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > MAX_INPUT_BYTES) {
      toast.error("Choose a JPEG, PNG or WebP image under 10 MB.");
      return;
    }
    setUploading(true);
    try {
      const blob = await toAvatarBlob(file);
      const path = `${state.profile.id}/${crypto.randomUUID()}.webp`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/webp", cacheControl: "31536000" });
      if (uploadError) throw uploadError;
      await setAvatar(path);
      toast.success("Photo updated.");
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't upload that photo."));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-6">
      <div className="flex items-center gap-4">
        <UserAvatar name={displayName || state.profile.display_name} path={state.profile.avatar_path} className="size-20 text-xl" />
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" id="avatar-file" onChange={(e) => onFile(e.target.files?.[0])} />
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Spinner /> : <Camera />} {state.profile.avatar_path ? "Change photo" : "Add photo"}
          </Button>
          {state.profile.avatar_path ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={uploading}
              onClick={() => setAvatar(null).catch((err) => toast.error(friendlyError(err)))}
            >
              <Trash2 /> Remove
            </Button>
          ) : null}
        </div>
      </div>
      <FormField id="displayName" label="Display name" error={error ?? undefined}>
        <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={50} aria-describedby="displayName-desc" required />
      </FormField>
      <FormField id="bio" label="Short bio (optional)" hint={`${[...bio].length}/${BIO_MAX} · Only your partner can see this.`}>
        <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))} rows={3} aria-describedby="bio-desc" />
      </FormField>
      <Button type="submit" disabled={saving} className="justify-self-start">
        {saving ? <Spinner /> : null}
        {submitLabel}
      </Button>
    </form>
  );
}
