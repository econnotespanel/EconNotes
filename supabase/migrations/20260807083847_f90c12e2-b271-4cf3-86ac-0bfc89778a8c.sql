REVOKE EXECUTE ON FUNCTION public.award_daily_login() FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_points(text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_leaderboard(integer) FROM anon;