-- The product is now called KindChat: reserve its name so nobody can impersonate the app.
insert into private.reserved_usernames (username_lower) values ('kindchat'), ('kind_chat'), ('kindchat_team')
on conflict (username_lower) do nothing;
