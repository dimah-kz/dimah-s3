import { SharedView } from "@/components/shared-view";

/** The page a share link opens. Visitors need no session. */
export default async function SharedPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 sm:p-8">
      <SharedView token={token} />
    </main>
  );
}
