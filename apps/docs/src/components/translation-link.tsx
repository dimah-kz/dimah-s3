import Link from "fumadocs-core/link";
import { buttonVariants } from "fumadocs-ui/components/ui/button";
import { LanguagesIcon } from "lucide-react";
import { cn } from "cn";
import type { PageLanguage } from "@/lib/page-language";

/** Link to the same page in another language, styled like the page actions. */
export function TranslationLink({
  href,
  lang,
  name,
  className,
}: {
  href: string;
  lang: PageLanguage;
  name: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      hrefLang={lang}
      lang={lang}
      className={cn(
        buttonVariants({
          variant: "secondary",
          size: "sm",
          className: "gap-2 [&_svg]:size-3.5 [&_svg]:text-fd-muted-foreground",
        }),
        className,
      )}
    >
      <LanguagesIcon aria-hidden />
      {name}
    </Link>
  );
}
