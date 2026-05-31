const DEFAULTS = {
    siteName: 'Art Space',
    siteTitle: 'Art Space — Works',
    worksLabel: 'Works',
    fullSignature: 'Art by Artist Name',
    shortSignature: 'Art by Artist Name',
    icpNumber: '',
    icpLink: '',
    socialLinks: [
        { label: 'Instagram', url: 'https://' }
    ],
    imageVariantWidthThumb: 400,
    imageVariantWidthMedium: 1400,
    imageVariantWidthLarge: 2400,
    imageVariantQuality: 82,
    imageOriginalQuality: 90,
    videoCrf: 23,
    videoBitrate: '2000k',
    videoAudioBitrate: '128k',
    videoMaxrate: '2500k',
    videoMaxResolution: '1920x1080',
    videoPreset: 'slow',
    language: ''
};

const STRING_FIELDS = {
    site_name: 'siteName',
    site_title: 'siteTitle',
    works_label: 'worksLabel',
    full_signature: 'fullSignature',
    short_signature: 'shortSignature',
    icp_number: 'icpNumber',
    icp_link: 'icpLink',
    video_bitrate: 'videoBitrate',
    video_audio_bitrate: 'videoAudioBitrate',
    video_maxrate: 'videoMaxrate',
    video_max_resolution: 'videoMaxResolution',
    video_preset: 'videoPreset',
    language: 'language'
};

const NUMERIC_FIELDS = {
    image_variant_width_thumb: 'imageVariantWidthThumb',
    image_variant_width_medium: 'imageVariantWidthMedium',
    image_variant_width_large: 'imageVariantWidthLarge',
    image_variant_quality: 'imageVariantQuality',
    image_original_quality: 'imageOriginalQuality',
    video_crf: 'videoCrf'
};

const KEY_MAP = {
    siteName: 'site_name',
    siteTitle: 'site_title',
    worksLabel: 'works_label',
    fullSignature: 'full_signature',
    shortSignature: 'short_signature',
    icpNumber: 'icp_number',
    icpLink: 'icp_link',
    imageVariantWidthThumb: 'image_variant_width_thumb',
    imageVariantWidthMedium: 'image_variant_width_medium',
    imageVariantWidthLarge: 'image_variant_width_large',
    imageVariantQuality: 'image_variant_quality',
    imageOriginalQuality: 'image_original_quality',
    videoCrf: 'video_crf',
    videoBitrate: 'video_bitrate',
    videoAudioBitrate: 'video_audio_bitrate',
    videoMaxrate: 'video_maxrate',
    videoMaxResolution: 'video_max_resolution',
    videoPreset: 'video_preset',
    language: 'language'
};

function loadSiteConfig(db) {
    const config = { ...DEFAULTS };
    if (!db) return config;

    const rows = db.prepare('SELECT key, value FROM settings').all();
    const map = new Map(rows.map((row) => [row.key, row.value]));

    for (const [dbKey, configKey] of Object.entries(STRING_FIELDS)) {
        if (map.has(dbKey) && map.get(dbKey)) config[configKey] = map.get(dbKey);
    }

    for (const [dbKey, configKey] of Object.entries(NUMERIC_FIELDS)) {
        if (map.has(dbKey) && map.get(dbKey) !== '') {
            const parsed = Number(map.get(dbKey));
            if (!Number.isNaN(parsed)) config[configKey] = parsed;
        }
    }

    const socialRows = db.prepare(
        "SELECT value FROM settings WHERE key = 'social_links'"
    ).all();

    if (socialRows.length && socialRows[0].value) {
        try {
            const parsed = JSON.parse(socialRows[0].value);
            if (Array.isArray(parsed) && parsed.length > 0) {
                config.socialLinks = parsed;
            }
        } catch (_) {}
    }

    return config;
}

function saveSiteConfig(db, updates) {
    const upsertSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

    const txn = db.transaction(() => {
        for (const [configKey, settingKey] of Object.entries(KEY_MAP)) {
            if (updates[configKey] !== undefined) {
                upsertSetting.run(settingKey, String(updates[configKey]));
            }
        }

        if (updates.socialLinks !== undefined) {
            upsertSetting.run('social_links', JSON.stringify(updates.socialLinks));
        }
    });

    txn();
}

module.exports = { DEFAULTS, loadSiteConfig, saveSiteConfig };
