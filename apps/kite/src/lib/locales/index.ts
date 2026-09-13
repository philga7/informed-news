import { applyBrandOverrides } from '$lib/brand';
import ar from './ar.json';
import de from './de.json';
import en from './en.json';
import es from './es.json';
import et from './et.json';
import fr from './fr.json';
import he from './he.json';
import hi from './hi.json';
import it from './it.json';
import ja from './ja.json';
import nl from './nl.json';
import pt from './pt.json';
import ru from './ru.json';
import uk from './uk.json';
import zhHans from './zh-Hans.json';
import zhHant from './zh-Hant.json';

type LocaleMap = Record<string, { text: string; translationContext: string }>;

function brand(locale: LocaleMap): LocaleMap {
	return applyBrandOverrides(locale);
}

export default {
	ar: brand(ar as LocaleMap),
	de: brand(de as LocaleMap),
	en: brand(en as LocaleMap),
	es: brand(es as LocaleMap),
	et: brand(et as LocaleMap),
	fr: brand(fr as LocaleMap),
	he: brand(he as LocaleMap),
	hi: brand(hi as LocaleMap),
	it: brand(it as LocaleMap),
	ja: brand(ja as LocaleMap),
	nl: brand(nl as LocaleMap),
	pt: brand(pt as LocaleMap),
	ru: brand(ru as LocaleMap),
	uk: brand(uk as LocaleMap),
	'zh-Hans': brand(zhHans as LocaleMap),
	'zh-Hant': brand(zhHant as LocaleMap),
} as Record<string, LocaleMap | undefined>;
