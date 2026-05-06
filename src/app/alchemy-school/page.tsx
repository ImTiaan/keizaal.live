import type { Metadata } from "next";
import { cookies } from "next/headers";
import AlchemyBook from "./AlchemyBook";
import AlchemySchoolLogin from "./AlchemySchoolLogin";
import { loadAlchemyBookPages } from "@/lib/alchemyBookPages";
import { getAlchemySchoolCookieName, verifyAlchemySchoolCookieValue } from "@/lib/alchemySchoolAuth";

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Alchemy School",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default async function AlchemySchoolPage() {
  const cookieName = getAlchemySchoolCookieName();
  const cookieValue = (await cookies()).get(cookieName)?.value;
  const authed = verifyAlchemySchoolCookieValue(cookieValue);

  if (!authed) {
    return (
      <main className="min-h-screen bg-keizaal-bg text-zinc-100 flex items-center justify-center px-4 py-12">
        <AlchemySchoolLogin />
      </main>
    );
  }

  const pages = await loadAlchemyBookPages();

  return (
    <main className="min-h-screen bg-keizaal-bg text-zinc-100 px-4 py-10 sm:py-14">
      <div className="max-w-6xl mx-auto">
        <AlchemyBook pages={pages} />
      </div>
    </main>
  );
}
