const path = require('path');
const { I18n } = require('i18n');

const i18n = new I18n({
    locales: ['zh-CN', 'zh-TW', 'en', 'ja'],
    defaultLocale: 'en',
    directory: path.join(__dirname, '..', 'locales'),
    autoReload: process.env.NODE_ENV !== 'production',
    updateFiles: false,
    syncFiles: false,
    objectNotation: true,
    cookie: 'locale',
    queryParameter: 'lang',
    indent: '  ',
    api: {
        __: '__',
        __n: '__n'
    },
    missingKeyFn: function (_locale, value) {
        return value;
    }
});

const SUPPORTED_LOCALES = ['zh-CN', 'zh-TW', 'en', 'ja'];

function getCatalog(locale) {
    return i18n.getCatalog(locale) || {};
}

function resolveLocale(req, siteConfig) {
    if (req.path && req.path.startsWith('/admin')) {
        if (siteConfig && siteConfig.language && SUPPORTED_LOCALES.includes(siteConfig.language)) {
            return siteConfig.language;
        }
    }

    const cookieLocale = req.cookies && req.cookies.locale;
    if (cookieLocale && SUPPORTED_LOCALES.includes(cookieLocale)) {
        return cookieLocale;
    }

    const acceptLanguage = req.headers['accept-language'] || '';
    if (/zh-CN|zh-Hans/i.test(acceptLanguage)) return 'zh-CN';
    if (/zh-TW|zh-HK|zh-Hant|zh-MO/i.test(acceptLanguage)) return 'zh-TW';
    if (/zh/i.test(acceptLanguage) && !/zh-TW|zh-HK|zh-Hant|zh-MO/i.test(acceptLanguage)) return 'zh-CN';
    if (/ja/i.test(acceptLanguage)) return 'ja';

    return 'en';
}

function i18nMiddleware(req, res, next) {
    i18n.init(req, res);

    const siteConfig = res.locals.siteConfig;
    const resolvedLocale = resolveLocale(req, siteConfig);

    req.setLocale(resolvedLocale);
    res.locals.locale = resolvedLocale;
    res.locals.__ = res.__;
    res.locals.__n = res.__n;
    res.locals.__catalog = getCatalog(resolvedLocale);

    next();
}

module.exports = {
    i18n,
    i18nMiddleware,
    SUPPORTED_LOCALES,
    getCatalog,
    resolveLocale
};
