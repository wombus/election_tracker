import Link from "next/link";

export default function NotFound() {
  return (
    <section className="page-head">
      <h1>Page not found</h1>
      <p className="lede">
        <Link href="/">Back to the results map →</Link>
      </p>
    </section>
  );
}
