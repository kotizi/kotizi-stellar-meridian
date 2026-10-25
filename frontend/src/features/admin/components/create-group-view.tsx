"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { MAX_FEE_BPS, MAX_NAME_BYTES, MAX_SHARES, MAX_URI_BYTES, utf8Length } from "@/chain/derive";
import { useChainAction } from "@/chain/hooks";
import { network } from "@/chain/network";
import { Chip } from "@/components/kz/chip";
import { Field } from "@/components/kz/field";
import { ScreenTitle } from "@/components/kz/screen";
import { SegmentedPills } from "@/components/kz/segmented-pills";
import { SurfaceList, SurfaceRow } from "@/components/kz/surface-list";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { GROUP_CONTENT, type GroupSlug } from "@/content/groups";
import { formatPeriod, formatUsdc, usdc } from "@/lib/format";
import { useSession } from "@/session/context";

const MAX_FEE_PCT = MAX_FEE_BPS / 100;

const PERIODS = [
  { value: 60, label: "1 min" },
  { value: 300, label: "5 min" },
  { value: 86_400, label: "Daily" },
  { value: 2_592_000, label: "Monthly" },
];

const SLUGS = Object.keys(GROUP_CONTENT) as GroupSlug[];

interface Form {
  slug: GroupSlug;
  name: string;
  propertyValue: string;
  shares: string;
  periodSecs: number;
  feePct: string;
}

type Errors = Partial<Record<"name" | "propertyValue" | "shares" | "feePct", string>>;

/** One cent in USDC base units: installments are whole cents. */
const CENT = 10_000n;

/**
 * The installment that makes the credit value (installment × shares) equal the property value, or
 * null when the value doesn't split into whole cents. The program has no property value: this
 * keeps every group created here in line with its property.
 */
function installmentFor(propertyValue: bigint, shares: number): bigint | null {
  const cents = propertyValue / CENT;
  return propertyValue % CENT === 0n && cents % BigInt(shares) === 0n ? propertyValue / BigInt(shares) : null;
}

/** Share counts (2–64) that split the property value evenly, the nearest to `shares` first. */
function evenShares(propertyValue: bigint, shares: number, count = 4): number[] {
  return Array.from({ length: MAX_SHARES - 1 }, (_, i) => i + 2)
    .filter((n) => installmentFor(propertyValue, n) !== null)
    .sort((a, b) => Math.abs(a - shares) - Math.abs(b - shares) || a - b)
    .slice(0, count)
    .sort((a, b) => a - b);
}

/** `Group.uri`: the property's metadata, with the value typed in the form. */
const metadataUri = (origin: string, form: Form) => `${origin}/metadata/${form.slug}.json?value=${Number(form.propertyValue)}`;

/**
 * The form checked like the program checks it; `input` is set only when every field is valid.
 * Amount and count errors show while typing (`split`: a share count that doesn't split the property
 * value); an empty field and the name only on submit. `quotaAmount` feeds the preview on its own.
 */
function validate(form: Form, origin: string) {
  const errors: Errors = {};
  const name = form.name.trim();
  if (!name) errors.name = "Enter a name";
  else if (utf8Length(name) > MAX_NAME_BYTES) errors.name = `${MAX_NAME_BYTES} characters at most`;
  const validValue = /^\d+(\.\d{1,2})?$/.test(form.propertyValue) && Number(form.propertyValue) > 0;
  if (!validValue) errors.propertyValue = "Enter an amount greater than zero";
  const propertyValue = validValue ? usdc(Number(form.propertyValue)) : 0n;
  const shares = Number(form.shares);
  let quotaAmount: bigint | null = null;
  let split: string | undefined;
  if (!/^\d+$/.test(form.shares) || shares < 2 || shares > MAX_SHARES) {
    errors.shares = `A group has 2 to ${MAX_SHARES} shares`;
  }
  else if (validValue) {
    quotaAmount = installmentFor(propertyValue, shares);
    if (quotaAmount === null) {
      const options = evenShares(propertyValue, shares).join(", ");
      split = `${formatUsdc(propertyValue)} USD doesn't split evenly into ${shares} shares. Try ${options}, or adjust the value.`;
    }
  }
  const feePct = Number(form.feePct);
  if (!/^\d+(\.\d{1,2})?$/.test(form.feePct) || feePct > MAX_FEE_PCT) errors.feePct = `Between 0 and ${MAX_FEE_PCT}%`;
  if (utf8Length(metadataUri(origin, form)) > MAX_URI_BYTES) {
    errors.propertyValue = "The metadata link is too long for this origin";
  }
  return {
    errors,
    propertyValue,
    split,
    quotaAmount,
    input:
      Object.keys(errors).length === 0 && quotaAmount !== null
        ? { name, quotaAmount, maxMembers: shares, periodSecs: form.periodSecs, adminFeeBps: Math.round(feePct * 100) }
        : null,
  };
}

// Admin only: opens a new group (`create_group`). The admin's account signs and pays. Only the
// admin reaches it (`AdminGate` in the admin layout).
export function CreateGroupView() {
  const { address } = useSession();
  const router = useRouter();
  const { run, pending } = useChainAction();
  const [form, setForm] = useState<Form>({
    slug: SLUGS[0],
    name: GROUP_CONTENT[SLUGS[0]].name,
    propertyValue: String(GROUP_CONTENT[SLUGS[0]].propertyValueUsd),
    shares: "5",
    periodSecs: 60,
    feePct: "2",
  });
  const [showErrors, setShowErrors] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const { errors, propertyValue: credit, split, quotaAmount, input } = validate(
    form,
    typeof window === "undefined" ? "" : window.location.origin,
  );
  const shown = showErrors ? errors : {};
  /** A typed amount or count shows its error right away; an empty one waits for submit. */
  const live = (field: "propertyValue" | "shares" | "feePct") => (form[field] === "" ? shown[field] : errors[field]);
  const content = GROUP_CONTENT[form.slug];
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  const create = async () => {
    if (!input || !address) return;
    setConfirming(false);
    const result = await run(
      "create",
      (c) =>
        c.createGroup({ organizer: address, ...input, uri: metadataUri(window.location.origin, form) }),
      { pending: "Creating the group…", success: "Group created" },
    );
    if (result) router.push(`/groups/${result.group}`);
  };

  return (
    <div className="flex flex-col gap-6">
      <ScreenTitle
        eyebrow="Admin"
        title="Create a group"
        caption="Set the property's value and how many shares split it: the credit value equals it and the installment is calculated. Members join from the open groups list."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
        <Card render={<form />} className="flex flex-col gap-5" onSubmit={(e) => e.preventDefault()}>
          <div className="flex flex-col gap-2">
            <span className="type-label-md text-secondary">Property</span>
            <div role="radiogroup" aria-label="Property" className="flex flex-wrap gap-2">
              {SLUGS.map((slug) => (
                <Chip
                  key={slug}
                  selected={slug === form.slug}
                  onClick={() =>
                    set({
                      slug,
                      name: form.name === GROUP_CONTENT[form.slug].name ? GROUP_CONTENT[slug].name : form.name,
                      propertyValue: String(GROUP_CONTENT[slug].propertyValueUsd),
                    })
                  }
                >
                  {GROUP_CONTENT[slug].name}
                </Chip>
              ))}
            </div>
            <p className="type-body-sm text-tertiary">
              {content.location} · {content.description}
            </p>
          </div>
          <Field label="Group name" error={shown.name} input={{ value: form.name, onChange: (e) => set({ name: e.target.value }) }} />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Property value (USD)"
              error={live("propertyValue")}
              input={{
                value: form.propertyValue,
                inputMode: "decimal",
                onChange: (e) => set({ propertyValue: e.target.value }),
              }}
            />
            <Field
              label={`Shares (2–${MAX_SHARES})`}
              error={live("shares") ?? split}
              input={{ value: form.shares, inputMode: "numeric", onChange: (e) => set({ shares: e.target.value }) }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <span className="type-label-md text-secondary">One draw</span>
            <SegmentedPills
              label="Period between draws"
              options={PERIODS}
              value={form.periodSecs}
              onChange={(periodSecs) => set({ periodSecs })}
            />
          </div>
          <Field
            label="Admin fee (%)"
            error={live("feePct")}
            input={{ value: form.feePct, inputMode: "decimal", onChange: (e) => set({ feePct: e.target.value }) }}
          />
        </Card>

        <div className="flex flex-col gap-3">
          <SurfaceList>
            <SurfaceRow label="Property value" value={credit > 0n ? `${formatUsdc(credit)} USD` : "—"} />
            <SurfaceRow label="Credit value" value={credit > 0n ? `${formatUsdc(credit)} USD` : "—"} />
            <SurfaceRow
              label="Term"
              value={errors.shares ? "—" : `${form.shares} draws, ${formatPeriod(form.periodSecs)}`}
            />
            <SurfaceRow label="Installment" value={quotaAmount !== null ? `${formatUsdc(quotaAmount)} USD` : "—"} />
            <SurfaceRow label="Admin fee" value={errors.feePct ? "—" : `${Number(form.feePct)}%`} />
          </SurfaceList>
          <p className="type-body-sm text-tertiary">
            Installment = property value ÷ shares. Each draw releases the credit value minus the admin fee.
          </p>
          <Button
            variant="primary"
            size="xl"
            disabled={pending !== null}
            onClick={() => (input ? setConfirming(true) : setShowErrors(true))}
          >
            {pending === "create" ? "Creating…" : "Create group"}
          </Button>
        </div>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent initialFocus={cancelRef} className="gap-5 p-6 sm:max-w-md">
          <div className="flex flex-col gap-1.5 pr-8">
            <DialogTitle className="type-h5">Create {input?.name}?</DialogTitle>
            <DialogDescription className="type-body-sm text-secondary">
              Check the details. The group opens as soon as you confirm, and they can&apos;t be changed later.
            </DialogDescription>
          </div>
          {input && (
            <SurfaceList>
              <SurfaceRow label="Credit value" value={`${formatUsdc(credit)} USD`} />
              <SurfaceRow label="Installment" value={`${formatUsdc(input.quotaAmount)} USD`} />
              <SurfaceRow label="Term" value={`${input.maxMembers} draws, ${formatPeriod(input.periodSecs)}`} />
              <SurfaceRow label="Admin fee" value={`${input.adminFeeBps / 100}%`} />
              <SurfaceRow label="Network" value={network.name} />
              <SurfaceRow label="Network fee and storage rent" value="Paid by the admin account" />
            </SurfaceList>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <DialogClose render={<Button ref={cancelRef} variant="secondary" size="lg" className="sm:flex-1" />}>
              Cancel
            </DialogClose>
            <Button variant="primary" size="lg" className="sm:flex-1" onClick={create}>
              Confirm and create
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
