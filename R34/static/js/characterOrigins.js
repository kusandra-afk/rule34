// ============================================================
// CHARACTER ORIGINS & FRANCHISE DATABASE
// Определяет источник персонажа (Франшиза / Игра / Аниме / Манга)
// ============================================================

import { icon } from './icons.js';

// Известные франшизы и их категории
export const FRANCHISE_DATABASE = {
    // --- ИГРЫ (GAMEPAD) ---
    'genshin_impact': { franchise: 'Genshin Impact', media: 'Игра', icon: 'gamepad' },
    'honkai:_star_rail': { franchise: 'Honkai: Star Rail', media: 'Игра', icon: 'gamepad' },
    'honkai_impact_3rd': { franchise: 'Honkai Impact 3rd', media: 'Игра', icon: 'gamepad' },
    'honkai_impact': { franchise: 'Honkai Impact 3rd', media: 'Игра', icon: 'gamepad' },
    'zenless_zone_zero': { franchise: 'Zenless Zone Zero', media: 'Игра', icon: 'gamepad' },
    'wuthering_waves': { franchise: 'Wuthering Waves', media: 'Игра', icon: 'gamepad' },
    'league_of_legends': { franchise: 'League of Legends', media: 'Игра', icon: 'gamepad' },
    'overwatch': { franchise: 'Overwatch', media: 'Игра', icon: 'gamepad' },
    'overwatch_2': { franchise: 'Overwatch 2', media: 'Игра', icon: 'gamepad' },
    'valorant': { franchise: 'Valorant', media: 'Игра', icon: 'gamepad' },
    'dota_2': { franchise: 'Dota 2', media: 'Игра', icon: 'gamepad' },
    'dota': { franchise: 'Dota', media: 'Игра', icon: 'gamepad' },
    'final_fantasy': { franchise: 'Final Fantasy', media: 'Игра', icon: 'gamepad' },
    'final_fantasy_vii': { franchise: 'Final Fantasy VII', media: 'Игра', icon: 'gamepad' },
    'final_fantasy_xiv': { franchise: 'Final Fantasy XIV', media: 'Игра', icon: 'gamepad' },
    'final_fantasy_xv': { franchise: 'Final Fantasy XV', media: 'Игра', icon: 'gamepad' },
    'final_fantasy_x': { franchise: 'Final Fantasy X', media: 'Игра', icon: 'gamepad' },
    'nier': { franchise: 'NieR', media: 'Игра', icon: 'gamepad' },
    'nier:automata': { franchise: 'NieR: Automata', media: 'Игра', icon: 'gamepad' },
    'nier_automata': { franchise: 'NieR: Automata', media: 'Игра', icon: 'gamepad' },
    'nier_(series)': { franchise: 'NieR', media: 'Игра', icon: 'gamepad' },
    'pokemon': { franchise: 'Pokémon', media: 'Игра / Аниме', icon: 'gamepad' },
    'street_fighter': { franchise: 'Street Fighter', media: 'Игра', icon: 'gamepad' },
    'tekken': { franchise: 'Tekken', media: 'Игра', icon: 'gamepad' },
    'mortal_kombat': { franchise: 'Mortal Kombat', media: 'Игра', icon: 'gamepad' },
    'dead_or_alive': { franchise: 'Dead or Alive', media: 'Игра', icon: 'gamepad' },
    'guilty_gear': { franchise: 'Guilty Gear', media: 'Игра', icon: 'gamepad' },
    'blazblue': { franchise: 'BlazBlue', media: 'Игра', icon: 'gamepad' },
    'resident_evil': { franchise: 'Resident Evil', media: 'Игра', icon: 'gamepad' },
    'silent_hill': { franchise: 'Silent Hill', media: 'Игра', icon: 'gamepad' },
    'the_witcher': { franchise: 'The Witcher', media: 'Игра / Книги', icon: 'gamepad' },
    'cyberpunk_2077': { franchise: 'Cyberpunk 2077', media: 'Игра', icon: 'gamepad' },
    'tomb_raider': { franchise: 'Tomb Raider', media: 'Игра', icon: 'gamepad' },
    'metroid': { franchise: 'Metroid', media: 'Игра', icon: 'gamepad' },
    'super_mario': { franchise: 'Super Mario', media: 'Игра', icon: 'gamepad' },
    'mario': { franchise: 'Super Mario', media: 'Игра', icon: 'gamepad' },
    'the_legend_of_zelda': { franchise: 'The Legend of Zelda', media: 'Игра', icon: 'gamepad' },
    'zelda': { franchise: 'The Legend of Zelda', media: 'Игра', icon: 'gamepad' },
    'sonic_the_hedgehog': { franchise: 'Sonic the Hedgehog', media: 'Игра / Мультфильм', icon: 'gamepad' },
    'sonic': { franchise: 'Sonic the Hedgehog', media: 'Игра', icon: 'gamepad' },
    'blue_archive': { franchise: 'Blue Archive', media: 'Игра', icon: 'gamepad' },
    'azur_lane': { franchise: 'Azur Lane', media: 'Игра / Аниме', icon: 'gamepad' },
    'arknights': { franchise: 'Arknights', media: 'Игра / Аниме', icon: 'gamepad' },
    'fate/grand_order': { franchise: 'Fate/Grand Order', media: 'Игра', icon: 'gamepad' },
    'fate_(series)': { franchise: 'Fate Series', media: 'Аниме / Игра', icon: 'tv' },
    'touhou': { franchise: 'Touhou Project', media: 'Игра', icon: 'gamepad' },
    'touhou_project': { franchise: 'Touhou Project', media: 'Игра', icon: 'gamepad' },
    'persona': { franchise: 'Persona', media: 'Игра / Аниме', icon: 'gamepad' },
    'persona_5': { franchise: 'Persona 5', media: 'Игра / Аниме', icon: 'gamepad' },
    'persona_4': { franchise: 'Persona 4', media: 'Игра / Аниме', icon: 'gamepad' },
    'persona_3': { franchise: 'Persona 3', media: 'Игра / Аниме', icon: 'gamepad' },
    'danganronpa': { franchise: 'Danganronpa', media: 'Игра / Аниме', icon: 'gamepad' },
    'ace_attorney': { franchise: 'Ace Attorney', media: 'Игра', icon: 'gamepad' },
    'monster_hunter': { franchise: 'Monster Hunter', media: 'Игра', icon: 'gamepad' },
    'dark_souls': { franchise: 'Dark Souls', media: 'Игра', icon: 'gamepad' },
    'elden_ring': { franchise: 'Elden Ring', media: 'Игра', icon: 'gamepad' },
    'bloodborne': { franchise: 'Bloodborne', media: 'Игра', icon: 'gamepad' },
    'devil_may_cry': { franchise: 'Devil May Cry', media: 'Игра', icon: 'gamepad' },
    'bayonetta': { franchise: 'Bayonetta', media: 'Игра', icon: 'gamepad' },
    'granblue_fantasy': { franchise: 'Granblue Fantasy', media: 'Игра / Аниме', icon: 'gamepad' },
    'princess_connect!': { franchise: 'Princess Connect!', media: 'Игра / Аниме', icon: 'gamepad' },
    'nikke': { franchise: 'GODDESS OF VICTORY: NIKKE', media: 'Игра', icon: 'gamepad' },
    'goddess_of_victory:_nikke': { franchise: 'GODDESS OF VICTORY: NIKKE', media: 'Игра', icon: 'gamepad' },
    'fire_emblem': { franchise: 'Fire Emblem', media: 'Игра', icon: 'gamepad' },
    'fire_emblem:_three_houses': { franchise: 'Fire Emblem: Three Houses', media: 'Игра', icon: 'gamepad' },
    'xenoblade_chronicles': { franchise: 'Xenoblade Chronicles', media: 'Игра', icon: 'gamepad' },
    'xenoblade_chronicles_2': { franchise: 'Xenoblade Chronicles 2', media: 'Игра', icon: 'gamepad' },
    'splatoon': { franchise: 'Splatoon', media: 'Игра', icon: 'gamepad' },
    'apex_legends': { franchise: 'Apex Legends', media: 'Игра', icon: 'gamepad' },
    'fortnite': { franchise: 'Fortnite', media: 'Игра', icon: 'gamepad' },
    'skullgirls': { franchise: 'Skullgirls', media: 'Игра', icon: 'gamepad' },
    'undertale': { franchise: 'Undertale', media: 'Игра', icon: 'gamepad' },
    'deltarune': { franchise: 'Deltarune', media: 'Игра', icon: 'gamepad' },
    'hollow_knight': { franchise: 'Hollow Knight', media: 'Игра', icon: 'gamepad' },
    'baldurs_gate': { franchise: "Baldur's Gate 3", media: 'Игра', icon: 'gamepad' },
    'baldur\'s_gate': { franchise: "Baldur's Gate 3", media: 'Игра', icon: 'gamepad' },
    'world_of_warcraft': { franchise: 'World of Warcraft', media: 'Игра', icon: 'gamepad' },
    'warcraft': { franchise: 'Warcraft', media: 'Игра', icon: 'gamepad' },
    'starcraft': { franchise: 'StarCraft', media: 'Игра', icon: 'gamepad' },
    'kingdom_hearts': { franchise: 'Kingdom Hearts', media: 'Игра', icon: 'gamepad' },
    'metal_gear': { franchise: 'Metal Gear', media: 'Игра', icon: 'gamepad' },
    'mass_effect': { franchise: 'Mass Effect', media: 'Игра', icon: 'gamepad' },
    'borderlands': { franchise: 'Borderlands', media: 'Игра', icon: 'gamepad' },
    'life_is_strange': { franchise: 'Life is Strange', media: 'Игра', icon: 'gamepad' },

    // --- АНИМЕ / МАНГА / РАНБЭ (TV / BOOK) ---
    'chainsaw_man': { franchise: 'Chainsaw Man', media: 'Аниме / Манга', icon: 'tv' },
    'naruto': { franchise: 'Naruto', media: 'Аниме / Манга', icon: 'tv' },
    'naruto_shippuden': { franchise: 'Naruto', media: 'Аниме / Манга', icon: 'tv' },
    'boruto': { franchise: 'Boruto', media: 'Аниме / Манга', icon: 'tv' },
    'one_piece': { franchise: 'One Piece', media: 'Аниме / Манга', icon: 'tv' },
    'bleach': { franchise: 'Bleach', media: 'Аниме / Манга', icon: 'tv' },
    'dragon_ball': { franchise: 'Dragon Ball', media: 'Аниме / Манга', icon: 'tv' },
    'dragon_ball_z': { franchise: 'Dragon Ball Z', media: 'Аниме / Манга', icon: 'tv' },
    'jojos_bizarre_adventure': { franchise: "JoJo's Bizarre Adventure", media: 'Аниме / Манга', icon: 'tv' },
    'jojo_no_kimyou_na_bouken': { franchise: "JoJo's Bizarre Adventure", media: 'Аниме / Манга', icon: 'tv' },
    'my_hero_academia': { franchise: 'My Hero Academia', media: 'Аниме / Манга', icon: 'tv' },
    'boku_no_hero_academia': { franchise: 'My Hero Academia', media: 'Аниме / Манга', icon: 'tv' },
    'demon_slayer': { franchise: 'Demon Slayer: Kimetsu no Yaiba', media: 'Аниме / Манга', icon: 'tv' },
    'kimetsu_no_yaiba': { franchise: 'Demon Slayer: Kimetsu no Yaiba', media: 'Аниме / Манга', icon: 'tv' },
    'jujutsu_kaisen': { franchise: 'Jujutsu Kaisen', media: 'Аниме / Манга', icon: 'tv' },
    'attack_on_titan': { franchise: 'Attack on Titan', media: 'Аниме / Манга', icon: 'tv' },
    'shingeki_no_kyojin': { franchise: 'Attack on Titan', media: 'Аниме / Манга', icon: 'tv' },
    'spy_x_family': { franchise: 'Spy × Family', media: 'Аниме / Манга', icon: 'tv' },
    'neon_genesis_evangelion': { franchise: 'Neon Genesis Evangelion', media: 'Аниме', icon: 'tv' },
    'evangelion': { franchise: 'Evangelion', media: 'Аниме', icon: 'tv' },
    're:zero': { franchise: 'Re:Zero', media: 'Аниме / Ранобэ', icon: 'tv' },
    're:zero_kara_hajimeru_isekai_seikatsu': { franchise: 'Re:Zero', media: 'Аниме / Ранобэ', icon: 'tv' },
    'konosuba': { franchise: 'KonoSuba', media: 'Аниме / Ранобэ', icon: 'tv' },
    'kono_subarashii_sekai_ni_shukufuku_wo!': { franchise: 'KonoSuba', media: 'Аниме / Ранобэ', icon: 'tv' },
    'sword_art_online': { franchise: 'Sword Art Online', media: 'Аниме / Ранобэ', icon: 'tv' },
    'fairy_tail': { franchise: 'Fairy Tail', media: 'Аниме / Манга', icon: 'tv' },
    'hunter_x_hunter': { franchise: 'Hunter × Hunter', media: 'Аниме / Манга', icon: 'tv' },
    'fullmetal_alchemist': { franchise: 'Fullmetal Alchemist', media: 'Аниме / Манга', icon: 'tv' },
    'code_geass': { franchise: 'Code Geass', media: 'Аниме', icon: 'tv' },
    'death_note': { franchise: 'Death Note', media: 'Аниме / Манга', icon: 'tv' },
    'one-punch_man': { franchise: 'One-Punch Man', media: 'Аниме / Манга', icon: 'tv' },
    'one_punch_man': { franchise: 'One-Punch Man', media: 'Аниме / Манга', icon: 'tv' },
    'mob_psycho_100': { franchise: 'Mob Psycho 100', media: 'Аниме / Манга', icon: 'tv' },
    'frieren:_beyond_journeys_end': { franchise: "Frieren: Beyond Journey's End", media: 'Аниме / Манга', icon: 'tv' },
    'sousou_no_frieren': { franchise: "Frieren: Beyond Journey's End", media: 'Аниме / Манга', icon: 'tv' },
    'oshi_no_ko': { franchise: 'Oshi no Ko', media: 'Аниме / Манга', icon: 'tv' },
    'sono_bisque_doll_wa_koi_wo_suru': { franchise: 'My Dress-Up Darling', media: 'Аниме / Манга', icon: 'tv' },
    'my_dress-up_darling': { franchise: 'My Dress-Up Darling', media: 'Аниме / Манга', icon: 'tv' },
    'kaguya-sama_wa_kokurasetai': { franchise: 'Kaguya-sama: Love Is War', media: 'Аниме / Манга', icon: 'tv' },
    'bocchi_the_rock!': { franchise: 'Bocchi the Rock!', media: 'Аниме / Манга', icon: 'tv' },
    'cyberpunk:_edgerunners': { franchise: 'Cyberpunk: Edgerunners', media: 'Аниме', icon: 'tv' },
    'kill_la_kill': { franchise: 'Kill la Kill', media: 'Аниме', icon: 'tv' },
    'tengen_toppa_gurren_lagann': { franchise: 'Gurren Lagann', media: 'Аниме', icon: 'tv' },
    'gurren_lagann': { franchise: 'Gurren Lagann', media: 'Аниме', icon: 'tv' },
    'sailor_moon': { franchise: 'Sailor Moon', media: 'Аниме / Манга', icon: 'tv' },
    'bishoujo_senshi_sailor_moon': { franchise: 'Sailor Moon', media: 'Аниме / Манга', icon: 'tv' },
    'puella_magi_madoka_magica': { franchise: 'Madoka Magica', media: 'Аниме', icon: 'tv' },
    'mahou_shoujo_madoka_magica': { franchise: 'Madoka Magica', media: 'Аниме', icon: 'tv' },
    'fate/stay_night': { franchise: 'Fate/stay night', media: 'Визуальная новелла / Аниме', icon: 'tv' },
    'fate/zero': { franchise: 'Fate/Zero', media: 'Аниме', icon: 'tv' },
    'to_love-ru': { franchise: 'To LOVE-Ru', media: 'Аниме / Манга', icon: 'tv' },
    'high_school_dxd': { franchise: 'High School DxD', media: 'Аниме / Ранобэ', icon: 'tv' },
    'monogatari_(series)': { franchise: 'Monogatari Series', media: 'Аниме / Ранобэ', icon: 'tv' },
    'bakemonogatari': { franchise: 'Bakemonogatari', media: 'Аниме', icon: 'tv' },
    'black_lagoon': { franchise: 'Black Lagoon', media: 'Аниме / Манга', icon: 'tv' },
    'overlord': { franchise: 'Overlord', media: 'Аниме / Ранобэ', icon: 'tv' },
    'mushoku_tensei': { franchise: 'Mushoku Tensei', media: 'Аниме / Ранобэ', icon: 'tv' },
    'danmachi': { franchise: 'DanMachi', media: 'Аниме / Ранобэ', icon: 'tv' },
    'dungeon_ni_deai_wo_motomeru_no_wa_machigatteiru_darou_ka': { franchise: 'DanMachi', media: 'Аниме / Ранобэ', icon: 'tv' },
    'gotoubun_no_hanayome': { franchise: 'The Quintessential Quintuplets', media: 'Аниме / Манга', icon: 'tv' },
    'the_quintessential_quintuplets': { franchise: 'The Quintessential Quintuplets', media: 'Аниме / Манга', icon: 'tv' },
    'nagatoro-san': { franchise: "Don't Toy With Me, Miss Nagatoro", media: 'Аниме / Манга', icon: 'tv' },
    'ijiranaide_nagatoro-san': { franchise: "Don't Toy With Me, Miss Nagatoro", media: 'Аниме / Манга', icon: 'tv' },
    'komi-san_wa_komyushou_desu': { franchise: "Komi Can't Communicate", media: 'Аниме / Манга', icon: 'tv' },
    'azumanga_daioh': { franchise: 'Azumanga Daioh', media: 'Аниме / Манга', icon: 'tv' },
    'lucky_star': { franchise: 'Lucky Star', media: 'Аниме / Манга', icon: 'tv' },
    'k-on!': { franchise: 'K-ON!', media: 'Аниме / Манга', icon: 'tv' },
    'haruhi_suzumiya': { franchise: 'The Melancholy of Haruhi Suzumiya', media: 'Аниме / Ранобэ', icon: 'tv' },
    'suzumiya_haruhi_no_yuuutsu': { franchise: 'The Melancholy of Haruhi Suzumiya', media: 'Аниме / Ранобэ', icon: 'tv' },
    'berserk': { franchise: 'Berserk', media: 'Манга / Аниме', icon: 'book' },
    'hellsing': { franchise: 'Hellsing', media: 'Аниме / Манга', icon: 'tv' },
    'dungeon_meshi': { franchise: 'Delicious in Dungeon', media: 'Аниме / Манга', icon: 'tv' },
    'delicious_in_dungeon': { franchise: 'Delicious in Dungeon', media: 'Аниме / Манга', icon: 'tv' },

    // --- VTUBERS / МУЗЫКА ---
    'vocaloid': { franchise: 'Vocaloid', media: 'Музыка / ПО', icon: 'music' },
    'hololive': { franchise: 'Hololive Production', media: 'VTuber', icon: 'tv' },
    'nijisanji': { franchise: 'NIJISANJI', media: 'VTuber', icon: 'tv' },
    'vshojo': { franchise: 'VShojo', media: 'VTuber', icon: 'tv' },

    // --- КОМИКСЫ / МУЛЬТФИЛЬМЫ / ФИЛЬМЫ ---
    'dc_comics': { franchise: 'DC Comics', media: 'Комикс / Фильм', icon: 'book' },
    'marvel': { franchise: 'Marvel Universe', media: 'Комикс / Фильм', icon: 'book' },
    'batman': { franchise: 'Batman (DC)', media: 'Комикс / Фильм', icon: 'book' },
    'spider-man': { franchise: 'Spider-Man (Marvel)', media: 'Комикс / Фильм', icon: 'book' },
    'x-men': { franchise: 'X-Men (Marvel)', media: 'Комикс / Фильм', icon: 'book' },
    'avatar:_the_last_airbender': { franchise: 'Avatar: The Last Airbender', media: 'Мультсериал', icon: 'tv' },
    'the_legend_of_korra': { franchise: 'The Legend of Korra', media: 'Мультсериал', icon: 'tv' },
    'adventure_time': { franchise: 'Adventure Time', media: 'Мультсериал', icon: 'tv' },
    'steven_universe': { franchise: 'Steven Universe', media: 'Мультсериал', icon: 'tv' },
    'gravity_falls': { franchise: 'Gravity Falls', media: 'Мультсериал', icon: 'tv' },
    'rick_and_morty': { franchise: 'Rick and Morty', media: 'Мультсериал', icon: 'tv' },
    'teen_titans': { franchise: 'Teen Titans', media: 'Мультсериал / Комикс', icon: 'tv' },
    'disney': { franchise: 'Disney', media: 'Мультфильм', icon: 'film' },
    'star_wars': { franchise: 'Star Wars', media: 'Киновселенная', icon: 'film' },
    'my_little_pony': { franchise: 'My Little Pony', media: 'Мультсериал', icon: 'tv' },
    'hazbin_hotel': { franchise: 'Hazbin Hotel', media: 'Мультсериал', icon: 'tv' },
    'helluva_boss': { franchise: 'Helluva Boss', media: 'Мультсериал', icon: 'tv' },
    'the_incredible_circus': { franchise: 'The Amazing Digital Circus', media: 'Анимация', icon: 'tv' },
    'the_amazing_digital_circus': { franchise: 'The Amazing Digital Circus', media: 'Анимация', icon: 'tv' },
};

// Прямые соответствия для самых популярных персонажей без тега франшизы
export const CHARACTER_DIRECT_MAP = {
    'tifa_lockhart': { franchise: 'Final Fantasy VII', media: 'Игра', icon: 'gamepad' },
    'aerith_gainsborough': { franchise: 'Final Fantasy VII', media: 'Игра', icon: 'gamepad' },
    'yuffie_kisaragi': { franchise: 'Final Fantasy VII', media: 'Игра', icon: 'gamepad' },
    'cloud_strife': { franchise: 'Final Fantasy VII', media: 'Игра', icon: 'gamepad' },
    'sephiroth': { franchise: 'Final Fantasy VII', media: 'Игра', icon: 'gamepad' },
    '2b': { franchise: 'NieR: Automata', media: 'Игра', icon: 'gamepad' },
    'a2': { franchise: 'NieR: Automata', media: 'Игра', icon: 'gamepad' },
    '9s': { franchise: 'NieR: Automata', media: 'Игра', icon: 'gamepad' },
    'ahri': { franchise: 'League of Legends', media: 'Игра', icon: 'gamepad' },
    'akali': { franchise: 'League of Legends', media: 'Игра', icon: 'gamepad' },
    'evelynn': { franchise: 'League of Legends', media: 'Игра', icon: 'gamepad' },
    'kaisa': { franchise: 'League of Legends', media: 'Игра', icon: 'gamepad' },
    'kai\'sa': { franchise: 'League of Legends', media: 'Игра', icon: 'gamepad' },
    'jinx': { franchise: 'League of Legends / Arcane', media: 'Игра / Анимация', icon: 'gamepad' },
    'vi': { franchise: 'League of Legends / Arcane', media: 'Игра / Анимация', icon: 'gamepad' },
    'caitlyn': { franchise: 'League of Legends / Arcane', media: 'Игра / Анимация', icon: 'gamepad' },
    'lux': { franchise: 'League of Legends', media: 'Игра', icon: 'gamepad' },
    'sona': { franchise: 'League of Legends', media: 'Игра', icon: 'gamepad' },
    'miss_fortune': { franchise: 'League of Legends', media: 'Игра', icon: 'gamepad' },
    'd.va': { franchise: 'Overwatch', media: 'Игра', icon: 'gamepad' },
    'tracer': { franchise: 'Overwatch', media: 'Игра', icon: 'gamepad' },
    'mercy': { franchise: 'Overwatch', media: 'Игра', icon: 'gamepad' },
    'widowmaker': { franchise: 'Overwatch', media: 'Игра', icon: 'gamepad' },
    'kiriko': { franchise: 'Overwatch 2', media: 'Игра', icon: 'gamepad' },
    'ashe': { franchise: 'Overwatch', media: 'Игра', icon: 'gamepad' },
    'brigitte': { franchise: 'Overwatch', media: 'Игра', icon: 'gamepad' },
    'chun-li': { franchise: 'Street Fighter', media: 'Игра', icon: 'gamepad' },
    'cammy_white': { franchise: 'Street Fighter', media: 'Игра', icon: 'gamepad' },
    'juri_han': { franchise: 'Street Fighter', media: 'Игра', icon: 'gamepad' },
    'samus_aran': { franchise: 'Metroid', media: 'Игра', icon: 'gamepad' },
    'zero_suit_samus': { franchise: 'Metroid', media: 'Игра', icon: 'gamepad' },
    'raiden_shogun': { franchise: 'Genshin Impact', media: 'Игра', icon: 'gamepad' },
    'yae_miko': { franchise: 'Genshin Impact', media: 'Игра', icon: 'gamepad' },
    'ganyu': { franchise: 'Genshin Impact', media: 'Игра', icon: 'gamepad' },
    'hu_tao': { franchise: 'Genshin Impact', media: 'Игра', icon: 'gamepad' },
    'mona_megistus': { franchise: 'Genshin Impact', media: 'Игра', icon: 'gamepad' },
    'kamisato_ayaka': { franchise: 'Genshin Impact', media: 'Игра', icon: 'gamepad' },
    'shenhe': { franchise: 'Genshin Impact', media: 'Игра', icon: 'gamepad' },
    'yelan': { franchise: 'Genshin Impact', media: 'Игра', icon: 'gamepad' },
    'furina': { franchise: 'Genshin Impact', media: 'Игра', icon: 'gamepad' },
    'navia': { franchise: 'Genshin Impact', media: 'Игра', icon: 'gamepad' },
    'kafka': { franchise: 'Honkai: Star Rail', media: 'Игра', icon: 'gamepad' },
    'silver_wolf': { franchise: 'Honkai: Star Rail', media: 'Игра', icon: 'gamepad' },
    'firefly': { franchise: 'Honkai: Star Rail', media: 'Игра', icon: 'gamepad' },
    'acheron': { franchise: 'Honkai: Star Rail', media: 'Игра', icon: 'gamepad' },
    'march_7th': { franchise: 'Honkai: Star Rail', media: 'Игра', icon: 'gamepad' },
    'hatsune_miku': { franchise: 'Vocaloid', media: 'Музыка / ПО', icon: 'music' },
    'megurine_luka': { franchise: 'Vocaloid', media: 'Музыка / ПО', icon: 'music' },
    'kagamine_rin': { franchise: 'Vocaloid', media: 'Музыка / ПО', icon: 'music' },
    'makima': { franchise: 'Chainsaw Man', media: 'Аниме / Манга', icon: 'tv' },
    'power': { franchise: 'Chainsaw Man', media: 'Аниме / Манга', icon: 'tv' },
    'reze': { franchise: 'Chainsaw Man', media: 'Аниме / Манга', icon: 'tv' },
    'marin_kitagawa': { franchise: 'My Dress-Up Darling', media: 'Аниме / Манга', icon: 'tv' },
    'yor_forger': { franchise: 'Spy × Family', media: 'Аниме / Манга', icon: 'tv' },
    'anya_forger': { franchise: 'Spy × Family', media: 'Аниме / Манга', icon: 'tv' },
    'asuka_langley_soryu': { franchise: 'Neon Genesis Evangelion', media: 'Аниме', icon: 'tv' },
    'rei_ayanami': { franchise: 'Neon Genesis Evangelion', media: 'Аниме', icon: 'tv' },
    'misato_katsuragi': { franchise: 'Neon Genesis Evangelion', media: 'Аниме', icon: 'tv' },
    'rem': { franchise: 'Re:Zero', media: 'Аниме / Ранобэ', icon: 'tv' },
    'ram': { franchise: 'Re:Zero', media: 'Аниме / Ранобэ', icon: 'tv' },
    'emilia': { franchise: 'Re:Zero', media: 'Аниме / Ранобэ', icon: 'tv' },
    'megumin': { franchise: 'KonoSuba', media: 'Аниме / Ранобэ', icon: 'tv' },
    'aqua': { franchise: 'KonoSuba', media: 'Аниме / Ранобэ', icon: 'tv' },
    'darkness': { franchise: 'KonoSuba', media: 'Аниме / Ранобэ', icon: 'tv' },
    'lucy': { franchise: 'Cyberpunk: Edgerunners', media: 'Аниме', icon: 'tv' },
    'rebecca': { franchise: 'Cyberpunk: Edgerunners', media: 'Аниме', icon: 'tv' },
    'fubuki': { franchise: 'One-Punch Man', media: 'Аниме / Манга', icon: 'tv' },
    'tatsumaki': { franchise: 'One-Punch Man', media: 'Аниме / Манга', icon: 'tv' },
    'frieren': { franchise: "Frieren: Beyond Journey's End", media: 'Аниме / Манга', icon: 'tv' },
    'fern': { franchise: "Frieren: Beyond Journey's End", media: 'Аниме / Манга', icon: 'tv' },
    'hancock': { franchise: 'One Piece', media: 'Аниме / Манга', icon: 'tv' },
    'nami': { franchise: 'One Piece', media: 'Аниме / Манга', icon: 'tv' },
    'nico_robin': { franchise: 'One Piece', media: 'Аниме / Манга', icon: 'tv' },
    'tsunade': { franchise: 'Naruto', media: 'Аниме / Манга', icon: 'tv' },
    'hinata_hyuga': { franchise: 'Naruto', media: 'Аниме / Манга', icon: 'tv' },
    'sakura_haruno': { franchise: 'Naruto', media: 'Аниме / Манга', icon: 'tv' },
    'matsuri': { franchise: 'Naruto', media: 'Аниме / Манга', icon: 'tv' },
    'yoruichi_shihoin': { franchise: 'Bleach', media: 'Аниме / Манга', icon: 'tv' },
    'rangiku_matsumoto': { franchise: 'Bleach', media: 'Аниме / Манга', icon: 'tv' },
    'orihime_inoue': { franchise: 'Bleach', media: 'Аниме / Манга', icon: 'tv' },
    'nezuko_kamado': { franchise: 'Demon Slayer', media: 'Аниме / Манга', icon: 'tv' },
    'mitsuri_kanroji': { franchise: 'Demon Slayer', media: 'Аниме / Манга', icon: 'tv' },
    'shinobu_kocho': { franchise: 'Demon Slayer', media: 'Аниме / Манга', icon: 'tv' },
    'kugisaki_nobara': { franchise: 'Jujutsu Kaisen', media: 'Аниме / Манга', icon: 'tv' },
    'maki_zenin': { franchise: 'Jujutsu Kaisen', media: 'Аниме / Манга', icon: 'tv' },
    'gawr_gura': { franchise: 'Hololive EN', media: 'VTuber', icon: 'tv' },
    'houshou_marine': { franchise: 'Hololive', media: 'VTuber', icon: 'tv' },
    'mori_calliope': { franchise: 'Hololive EN', media: 'VTuber', icon: 'tv' },
};

const localCache = new Map();

/**
 * Определяет происхождение тега персонажа по имени и сопутствующим тегам
 */
export function resolveCharacterOrigin(tagObj) {
    if (!tagObj) return null;
    const tagName = typeof tagObj === 'string' ? tagObj : (tagObj.name || '');
    if (!tagName) return null;

    const normalized = tagName.toLowerCase().trim();

    if (localCache.has(normalized)) {
        return localCache.get(normalized);
    }

    // 1. Проверяем точный словарь персонажей
    if (CHARACTER_DIRECT_MAP[normalized]) {
        const res = CHARACTER_DIRECT_MAP[normalized];
        localCache.set(normalized, res);
        return res;
    }

    // 2. Проверяем тег на наличие скобок (например, makima_(chainsaw_man))
    if (normalized.includes('(') && normalized.includes(')')) {
        const match = normalized.match(/^(.*?)\s*\((.*?)\)$/);
        if (match) {
            const charPart = match[1].trim();
            const franchisePart = match[2].trim();

            // Проверяем франшизу в словаре
            if (FRANCHISE_DATABASE[franchisePart]) {
                const res = FRANCHISE_DATABASE[franchisePart];
                localCache.set(normalized, res);
                return res;
            }

            // Если не в словаре, красиво форматируем имя франшизы из скобок
            const formattedFranchise = franchisePart
                .replace(/_/g, ' ')
                .replace(/\b\w/g, l => l.toUpperCase());

            let mediaType = 'Франшиза';
            let iconName = 'tag';

            // Простая классификация по ключевым словам
            if (/game|nier|ff|zelda|mario|souls|impact|pokemon|fantasy/i.test(franchisePart)) {
                mediaType = 'Игра';
                iconName = 'gamepad';
            } else if (/anime|manga|monogatari|sensei|isekai|hero|slayer|bleach|piece|jojo/i.test(franchisePart)) {
                mediaType = 'Аниме / Манга';
                iconName = 'tv';
            } else if (/marvel|dc|comic|disney|cartoon/i.test(franchisePart)) {
                mediaType = 'Комикс / Мультфильм';
                iconName = 'film';
            }

            const res = { franchise: formattedFranchise, media: mediaType, icon: iconName };
            localCache.set(normalized, res);
            return res;
        }
    }

    // 3. Проверяем известные франшизы как подстроку или точное совпадение
    for (const [key, val] of Object.entries(FRANCHISE_DATABASE)) {
        if (normalized === key || normalized.endsWith(`_${key}`) || normalized.startsWith(`${key}_`)) {
            localCache.set(normalized, val);
            return val;
        }
    }

    // 4. Проверяем теги, прикрепленные к посту (postTags)
    if (tagObj.postTags && Array.isArray(tagObj.postTags)) {
        for (const pt of tagObj.postTags) {
            const cleanPt = pt.toLowerCase().trim();
            if (FRANCHISE_DATABASE[cleanPt]) {
                const res = FRANCHISE_DATABASE[cleanPt];
                localCache.set(normalized, res);
                return res;
            }
        }
    }

    if (tagObj.copyright) {
        if (FRANCHISE_DATABASE[tagObj.copyright]) {
            const res = FRANCHISE_DATABASE[tagObj.copyright];
            localCache.set(normalized, res);
            return res;
        } else {
            const formattedFranchise = tagObj.copyright.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            const res = { franchise: formattedFranchise, media: 'Франшиза', icon: 'tag' };
            localCache.set(normalized, res);
            return res;
        }
    }

    // Fallback: If this tag itself IS a copyright tag (e.g. from Universes mode)
    if (tagObj.isCopyright || tagObj.type === 3) {
        const formattedFranchise = normalized.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const res = { franchise: formattedFranchise, media: 'Франшиза', icon: 'tag' };
        localCache.set(normalized, res);
        return res;
    }

    return null;
}

/**
 * Рендерит красивый HTML-бейдж с источником персонажа
 */
export function renderOriginBadgeHtml(tagObj) {
    const origin = resolveCharacterOrigin(tagObj);
    if (!origin) return '';

    const cleanTagName = (tagObj.name || '').replace(/_/g, ' ').toLowerCase().trim();
    const cleanFranchise = (origin.franchise || '').toLowerCase().trim();
    const isSame = cleanTagName === cleanFranchise || (cleanTagName.includes(cleanFranchise) && cleanTagName.length <= cleanFranchise.length + 3);

    return `
        <div class="hl-origin-badge" title="Вселенная: ${origin.franchise} (${origin.media})">
            <span class="hl-origin-icon">${icon(origin.icon, { size: 13 })}</span>
            ${isSame ? '' : `<span class="hl-origin-title">${origin.franchise}</span><span class="hl-origin-sep">•</span>`}
            <span class="hl-origin-media">${origin.media}</span>
        </div>
    `;
}

