import { NotFoundState } from "@/components/shared/not-found-state";

export default function NotFound() {
  return (
    <main className="px-4 py-16">
      <NotFoundState
        title="Page not found"
        description="The page you're looking for doesn't exist or has moved."
        backHref="/"
        backLabel="Back to dashboard"
      />
    </main>
  );
}
