/**
 * Canonical Tag Resolver and Alias Mapping
 * Resolves short aliases, abbreviations, and misnamed tags to their official Rule34 canonical tags.
 * Also provides clean, user-friendly display titles for complex/romanized franchise names.
 */

export const CANONICAL_TAG_MAP = {
    // === Franchises / Copyrights ===
    're:zero': 're:zero_kara_hajimeru_isekai_seikatsu',
    'rezero': 're:zero_kara_hajimeru_isekai_seikatsu',
    're_zero': 're:zero_kara_hajimeru_isekai_seikatsu',
    'konosuba': 'kono_subarashii_sekai_ni_shukufuku_wo!',
    'danmachi': 'dungeon_ni_deai_wo_motomeru_no_wa_machigatteiru_darou_ka',
    'frieren': 'sousou_no_frieren',
    'frieren:_beyond_journeys_end': 'sousou_no_frieren',
    'frieren_beyond_journeys_end': 'sousou_no_frieren',
    'evangelion': 'neon_genesis_evangelion',
    'eva': 'neon_genesis_evangelion',
    'my_dress-up_darling': 'sono_bisque_doll_wa_koi_wo_suru',
    'my_dress_up_darling': 'sono_bisque_doll_wa_koi_wo_suru',
    'sono_bisque_doll': 'sono_bisque_doll_wa_koi_wo_suru',
    'nagatoro': 'ijiranaide_nagatoro-san',
    'dont_toy_with_me_miss_nagatoro': 'ijiranaide_nagatoro-san',
    'komi-san': 'komi-san_wa_komyushou_desu',
    'komi_cant_communicate': 'komi-san_wa_komyushou_desu',
    'bocchi': 'bocchi_the_rock!',
    'bocchi_the_rock': 'bocchi_the_rock!',
    'gotoubun': 'gotoubun_no_hanayome',
    '5toubun_no_hanayome': 'gotoubun_no_hanayome',
    'the_quintessential_quintuplets': 'gotoubun_no_hanayome',
    'to_love_ru': 'to_love-ru',
    'toloveru': 'to_love-ru',
    'honkai_star_rail': 'honkai:_star_rail',
    'hsr': 'honkai:_star_rail',
    'final_fantasy_7': 'final_fantasy_vii',
    'ff7': 'final_fantasy_vii',
    'final_fantasy_14': 'final_fantasy_xiv',
    'ff14': 'final_fantasy_xiv',
    'ffxiv': 'final_fantasy_xiv',
    'nier_automata': 'nier:automata',
    'mha': 'my_hero_academia',
    'bnha': 'my_hero_academia',
    'boku_no_hero_academia': 'my_hero_academia',
    'aot': 'attack_on_titan',
    'snk': 'attack_on_titan',
    'shingeki_no_kyojin': 'attack_on_titan',
    'csm': 'chainsaw_man',
    'jojo': 'jojos_bizarre_adventure',
    'jojo_no_kimyou_na_bouken': 'jojos_bizarre_adventure',
    'sao': 'sword_art_online',
    'edgerunners': 'cyberpunk:_edgerunners',
    'cyberpunk': 'cyberpunk_2077',
    'lol': 'league_of_legends',
    'ow': 'overwatch',
    'genshin': 'genshin_impact',
    'fate': 'fate/grand_order',
    'fgo': 'fate/grand_order',
    'zelda': 'the_legend_of_zelda',
    'mario': 'super_mario',
    'sonic': 'sonic_the_hedgehog',
    'dbz': 'dragon_ball',
    'dragon_ball_z': 'dragon_ball',

    // === Characters ===
    'd.va_(overwatch)': 'd.va',
    'dva': 'd.va',
    'lucy_(cyberpunk)': 'lucyna_kushinada',
    'lucy_(cyberpunk:_edgerunners)': 'lucyna_kushinada',
    'makima': 'makima_(chainsaw_man)',
    'ganyu': 'ganyu_(genshin_impact)',
    'samus': 'samus_aran',
    'aqua': 'aqua_(konosuba)',
    'yor': 'yor_forger',
    'chun_li': 'chun-li',
    'marin': 'marin_kitagawa',
    '2b': '2b_(nier:automata)',
    'raiden': 'raiden_shogun',
    'tifa': 'tifa_lockhart',
    'aerith': 'aerith_gainsborough',
    'ahri': 'ahri_(league_of_legends)'
};

export const CANONICAL_DISPLAY_NAMES = {
    're:zero_kara_hajimeru_isekai_seikatsu': 'Re:Zero (Re:Zero kara Hajimeru Isekai Seikatsu)',
    'kono_subarashii_sekai_ni_shukufuku_wo!': 'KonoSuba (God\'s Blessing on This Wonderful World!)',
    'dungeon_ni_deai_wo_motomeru_no_wa_machigatteiru_darou_ka': 'DanMachi (Is It Wrong to Try to Pick Up Girls in a Dungeon?)',
    'sousou_no_frieren': 'Frieren: Beyond Journey\'s End (Sousou no Frieren)',
    'neon_genesis_evangelion': 'Neon Genesis Evangelion',
    'sono_bisque_doll_wa_koi_wo_suru': 'My Dress-Up Darling (Sono Bisque Doll)',
    'ijiranaide_nagatoro-san': 'Don\'t Toy with Me, Miss Nagatoro',
    'komi-san_wa_komyushou_desu': 'Komi Can\'t Communicate',
    'gotoubun_no_hanayome': 'The Quintessential Quintuplets (Gotoubun no Hanayome)',
    'to_love-ru': 'To LOVE-Ru',
    'honkai:_star_rail': 'Honkai: Star Rail',
    'honkai_impact_3rd': 'Honkai Impact 3rd',
    'zenless_zone_zero': 'Zenless Zone Zero',
    'final_fantasy_vii': 'Final Fantasy VII',
    'final_fantasy_xiv': 'Final Fantasy XIV',
    'nier:automata': 'NieR:Automata',
    'my_hero_academia': 'My Hero Academia (Boku no Hero Academia)',
    'kimetsu_no_yaiba': 'Demon Slayer (Kimetsu no Yaiba)',
    'attack_on_titan': 'Attack on Titan (Shingeki no Kyojin)',
    'jojos_bizarre_adventure': 'JoJo\'s Bizarre Adventure',
    'fate/grand_order': 'Fate/Grand Order',
    'fate_(series)': 'Fate (Series)',
    'cyberpunk:_edgerunners': 'Cyberpunk: Edgerunners',
    'league_of_legends': 'League of Legends',
    'the_legend_of_zelda': 'The Legend of Zelda',
    'sonic_the_hedgehog': 'Sonic the Hedgehog',
    'lucyna_kushinada': 'Lucy (Cyberpunk: Edgerunners)',
    'd.va': 'D.Va (Overwatch)'
};

/**
 * Resolves any tag to its canonical, high-volume counterpart if known.
 */
export function resolveCanonicalTag(rawTag) {
    if (!rawTag) return '';
    const clean = rawTag.toLowerCase().trim();
    return CANONICAL_TAG_MAP[clean] || rawTag.trim();
}

/**
 * Formats a tag name for the UI cleanly.
 */
export function formatDisplayTagName(tag) {
    if (!tag) return '';
    const clean = tag.toLowerCase().trim();
    if (CANONICAL_DISPLAY_NAMES[clean]) {
        return CANONICAL_DISPLAY_NAMES[clean];
    }
    // Check if canonical version has a pretty name
    const canonical = resolveCanonicalTag(clean);
    if (CANONICAL_DISPLAY_NAMES[canonical]) {
        return CANONICAL_DISPLAY_NAMES[canonical];
    }
    return tag.replace(/_/g, ' ');
}
