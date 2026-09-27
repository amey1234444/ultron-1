import type { GetServerSideProps } from 'next';

/**
 * Make a page exist in development and 404 in production.
 *
 * The `__*-qa` harnesses are real pages under `src/pages/`, so the Pages Router
 * serves them by filename wherever the app runs — including production, where
 * they were reachable by anyone who guessed the URL. They render live console
 * components against seeded state, which is exactly what makes them useful in
 * development and exactly what should not be publicly routable.
 *
 * Returning `notFound` rather than redirecting keeps the page indistinguishable
 * from one that was never built: the production response is the ordinary 404,
 * and nothing in it confirms the route exists.
 *
 * Usage, in any page that should not ship:
 *
 *   export const getServerSideProps = devOnlyPage;
 */
export const devOnlyPage: GetServerSideProps = async () => {
  if (process.env.NODE_ENV === 'production') return { notFound: true };
  return { props: {} };
};
