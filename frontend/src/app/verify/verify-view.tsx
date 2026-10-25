"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import type { Address, KotiziClient } from "@/chain";
import { invalidateChain, useChainAction } from "@/chain/hooks";
import { useKotiziClient } from "@/chain/provider";
import { Logo } from "@/components/brand/logo";
import { Field } from "@/components/kz/field";
import { Luz } from "@/components/kz/luz";
import { ScreenTitle } from "@/components/kz/screen";
import { textLinkVariants } from "@/components/kz/text-link";
import { AppIcon } from "@/components/kz/vidro-k";
import { useIdentityCheckRequired } from "@/components/shell/identity-gate";
import { useSignOut } from "@/components/shell/use-sign-out";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  BIRTH_DATE_MAX,
  BIRTH_DATE_MIN,
  formatCpf,
  validateIdentity,
  type IdentityDetails,
  type IdentityErrors,
} from "@/lib/identity";
import { sleep } from "@/lib/sleep";
import { useSession } from "@/session/context";

/**
 * Waits until a fresh read shows the identity record (a lagging RPC node could still answer
 * "none"), so the gate doesn't send the user straight back here.
 */
async function waitForIdentity(client: KotiziClient, wallet: Address) {
  for (let attempt = 0; attempt < 10; attempt++) {
    if (await client.getKyc(wallet).catch(() => null)) break;
    await sleep(1_000);
  }
  invalidateChain();
}

/** Where to go afterwards: only paths inside the app (`//host` and `/\host` lead to other origins). */
function safeNext(value: string | null): string {
  return value && /^\/(?![/\\])/.test(value) ? value : "/home";
}

// Identity verification (demo). New accounts and wallets without an identity record land here
// before the app; the details are checked on this device and never sent: the backend only approves
// the wallet's on-chain identity record.
export function VerifyView() {
  const session = useSession();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const client = useKotiziClient();
  const required = useIdentityCheckRequired();
  const { run, pending } = useChainAction();
  const [finishing, setFinishing] = useState(false);
  const signOut = useSignOut();
  const [details, setDetails] = useState<IdentityDetails>({ fullName: "", cpf: "", birthDate: "" });
  const [errors, setErrors] = useState<IdentityErrors>({});

  useEffect(() => {
    if (session.status === "signedOut") router.replace("/");
  }, [session.status, router]);

  if (session.status !== "signedIn" || !session.address) return null;
  const address = session.address;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found = validateIdentity(details, new Date());
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    // This screen shows its own progress and result; the status dialog only opens on a failure.
    const result = await run(
      "kyc",
      (c) => c.verifyIdentity(address),
      { pending: "Verifying identity…", success: "Identity verified", failure: "Verification not completed" },
      { feedback: "errors" },
    );
    if (!result) return;
    setFinishing(true);
    await waitForIdentity(client, address);
    session.completeIdentityCheck();
    setFinishing(false);
  };

  const update =
    (field: keyof IdentityDetails, format: (value: string) => string = (value) => value) =>
    (event: { target: { value: string } }) => {
      setDetails((d) => ({ ...d, [field]: format(event.target.value) }));
      setErrors((e) => ({ ...e, [field]: undefined }));
    };

  // Once `completeIdentityCheck` runs, the check is no longer required for this account.
  const verified = required === false && !finishing;

  return (
    <main className="relative isolate flex min-h-svh flex-1 flex-col overflow-hidden">
      <Luz className="-z-10 opacity-60" />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-4 pt-8 pb-10">
        <Logo className="h-[26px] w-auto self-start text-white" />

        {verified ? (
          <div className="flex flex-col items-start gap-6 pt-6">
            <AppIcon />
            <ScreenTitle
              eyebrow="Identity verification"
              title="Your identity is verified."
              caption="You can join any open group."
            />
            <Link href={next} className={buttonVariants({ variant: "primary", size: "xl", className: "w-full" })}>
              {next === "/home" ? "Go to home" : "Continue"}
            </Link>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              <ScreenTitle
                eyebrow="Identity verification"
                title="Verify your identity"
                caption="Required to join a group. It takes less than a minute."
              />
            </div>

            <Card render={<form noValidate onSubmit={submit} />} padding="md" className="flex flex-col gap-5">
              <Field
                label="Full name"
                error={errors.fullName}
                input={{ value: details.fullName, onChange: update("fullName"), autoComplete: "name" }}
              />
              <Field
                label="CPF"
                error={errors.cpf}
                input={{
                  value: details.cpf,
                  onChange: update("cpf", formatCpf),
                  placeholder: "000.000.000-00",
                  inputMode: "numeric",
                  maxLength: 14,
                }}
              />
              <Field
                label="Date of birth"
                error={errors.birthDate}
                input={{
                  value: details.birthDate,
                  onChange: update("birthDate"),
                  type: "date",
                  autoComplete: "bday",
                  min: BIRTH_DATE_MIN,
                  max: BIRTH_DATE_MAX,
                }}
              />
              <Button type="submit" variant="primary" size="xl" disabled={pending !== null || finishing}>
                {finishing ? "Confirming…" : pending !== null ? "Verifying…" : "Verify identity"}
              </Button>
            </Card>
          </>
        )}

        <button
          type="button"
          onClick={() => void signOut()}
          className={textLinkVariants({ className: "mt-auto h-11 justify-center self-center" })}
        >
          Sign out
        </button>
      </div>
    </main>
  );
}
