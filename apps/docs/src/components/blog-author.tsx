import { formatBlogDate, type BlogAuthor } from "@/lib/blog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

export function BlogAuthor({
  author,
  date,
}: {
  author: BlogAuthor;
  date?: string;
}) {
  const identity = (
    <>
      <Avatar size="sm">
        {author.avatar ? <AvatarImage alt="" src={author.avatar} /> : null}
        <AvatarFallback>{initials(author.name)}</AvatarFallback>
      </Avatar>
      <span className="font-medium text-foreground">{author.name}</span>
    </>
  );

  return (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      {author.url ? (
        <a
          href={author.url}
          rel="noreferrer"
          target="_blank"
          className="relative z-10 flex items-center gap-2 hover:underline"
        >
          {identity}
        </a>
      ) : (
        <span className="flex items-center gap-2">{identity}</span>
      )}
      {date ? (
        <>
          <span aria-hidden className="text-muted-foreground">
            ·
          </span>
          <time className="text-muted-foreground" dateTime={date}>
            {formatBlogDate(date)}
          </time>
        </>
      ) : null}
    </div>
  );
}
