import { SearchX } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

import { Panel } from "./panel";

interface NotFoundStateProps {
  title: string;
  description: string;
  backHref: string;
  backLabel: string;
}

export function NotFoundState({ title, description, backHref, backLabel }: NotFoundStateProps) {
  return (
    <Panel className="mx-auto mt-10 flex max-w-md flex-col items-center px-8 py-12 text-center">
      <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-background text-muted-foreground">
        <SearchX className="size-5" aria-hidden />
      </div>
      <h1 className="font-heading text-2xl font-medium">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      <Button asChild variant="secondary" className="mt-6">
        <Link href={backHref}>{backLabel}</Link>
      </Button>
    </Panel>
  );
}
