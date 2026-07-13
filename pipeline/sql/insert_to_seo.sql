insert into pypi.seo_cache (normalized_name, seo_header)
select  
    normalized_name,
    -- We construct the entire HTML block in a single optimized pass
    concat('<title>', left(package_name, 22), ' v', left(last_version, 8), ' Dependency Graph | PyPIMap</title>
<meta name="description" content="Analyze ', left(package_name, 30), ' (v', left(last_version, 8), ') with ', m.releases_count::varchar, ' releases. Structural metrics: ', parent_core_counts::varchar, ' core dependents, ', children_core_counts::varchar, ' core dependencies. View full interactive network graph map." />
<link rel="canonical" href="https://pypimap.com/package/', normalized_name, '" />
<meta property="og:type" content="website" />
<meta property="og:title" content="', left(package_name, 30), ' Ecosystem Map & Graph Analytics" />
<meta property="og:description" content="Interactive network visualization for ', left(package_name, 30), '. Explore ', m.releases_count::varchar, ' versions, upload history, and core dependency vectors." />
<meta property="og:url" content="https://pypimap.com/package/', normalized_name, '" />
<meta property="og:site_name" content="PyPiMap" />
<meta property="og:image" content="https://pypimap.com/assets/og-preview.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="', left(package_name, 30), ' Ecosystem Map" />
<meta name="twitter:description" content="Explore upstream and downstream dependencies for ', left(package_name, 30), ' visually." />
<meta name="twitter:image" content="https://pypimap.com/assets/og-preview.png" />
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-R10LEPYJJE"></script>
<script>
window.dataLayer = window.dataLayer || []
function gtag(){dataLayer.push(arguments)}
gtag(''js'', new Date())
gtag(''config'', ''G-R10LEPYJJE'')
</script>
<script type="application/ld+json">
{
"@context": "https://schema.org",
"@graph": [
{
    "@type": "Person",
    "@id": "https://naelaqel.com/#person",
    "name": "Nael Aqel",
    "url": "https://naelaqel.com",
    "sameAs": [
        "https://www.linkedin.com/in/naelaqel1",
        "https://github.com/naelaqel",
        "https://www.kaggle.com/naelaqel",
        "https://linktr.ee/naelaqel",
        "https://www.reddit.com/user/naelaqel",
        "https://www.quora.com/profile/Naelaqel",
        "https://medium.com/@naelaqel",
        "https://www.upwork.com/freelancers/naelaqel",
        "https://public.tableau.com/app/profile/nael.aqel"
    ]
},
{
    "@type": "WebApplication",
    "@id": "https://pypimap.com/#website",
    "name": "PyPiMap",
    "url": "https://pypimap.com",
    "description": "Interactive data platform analyzing the Python package dependency ecosystem maps.",
    "applicationCategory": "DeveloperApplication",
    "operatingSystem": "All",
    "creator": { "@id": "https://naelaqel.com/#person" },
    "publisher": { "@id": "https://naelaqel.com/#person" },
    "maintainer": { "@id": "https://naelaqel.com/#person" },
    "codeRepository": "https://github.com/naelaqel/pypimap",
    "license": "https://opensource.org/licenses/MIT",
    "isBasedOn": [
        {
            "@type": "Dataset",
            "name": "PyPI Simple API Registry Metadata",
            "description": "Upstream package dependency metadata extracted via the official Python Packaging Authority (PyPA) Simple API endpoints.",
            "url": "https://pypi.org/simple/"
        },
        {
            "@type": "Dataset",
            "name": "PyPI Stats Download Metrics",
            "description": "Aggregate download statistics, installation velocity records, and package usage logs sourced from PyPI Stats.",
            "url": "https://pypistats.org/"
        }
    ],
    "hasPart": {
        "@type": "Dataset",
        "name": "PyPI Daily Package Profiles & Analytics Graph",
        "description": "Pre-vectorized pipeline node snapshots optimized for Graph Neural Networks and dependency analysis.",
        "url": "https://www.kaggle.com/datasets/naelaqel/pypi-daily-metadata-and-analytics-base-dataset/data",
        "license": "https://creativecommons.org/licenses/by/4.0/",
        "creator": {
            "@type": "Person",
            "name": "Nael Aqel"
        }
    }
},
{
    "@type": "SoftwareSourceCode",
    "@id": "https://pypimap.com/package/', normalized_name, '#software",
    "name": "', package_name, '",
    "identifier": "', normalized_name, '",
    "operatingSystem": "Cross-platform",
    "applicationCategory": "DeveloperApplication",
    "softwareVersion": "', last_version, '",
    "description": "Analyze ', left(package_name, 30), ' (v', left(last_version, 8), ') with ', m.releases_count::varchar, ' releases. Structural metrics: ', parent_core_counts::varchar, ' core dependents, ', children_core_counts::varchar, ' core dependencies.",
    "url": "https://pypimap.com/package/', normalized_name, '",
    ', case when home_page is not null and home_page != '' then concat('"downloadUrl": "', home_page, '",') else '' end, '
    "dateCreated": "', to_char(first_upload_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), '",
    "dateModified": "', to_char(last_upload_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), '",
    "author": {
        "@type": "Person",
        "name": "', COALESCE(author, 'Unknown'), '"
    }
},
{
    "@type": "ItemPage",
    "@id": "https://pypimap.com/package/', normalized_name, '",
    "url": "https://pypimap.com/package/', normalized_name, '",
    "name": "', package_name, ' Interactivity Map & Analysis Page",
    "mainEntity": {
        "@id": "https://pypimap.com/package/', normalized_name, '#software"
    },
    "about": [
        {"@type": "PropertyValue", "name": "Parent Core Counts", "value": "', parent_core_counts::varchar, '"},
        {"@type": "PropertyValue", "name": "Parent Non-Core Counts", "value": "', parent_non_core_counts::varchar, '"},
        {"@type": "PropertyValue", "name": "Children Core Counts", "value": "', children_core_counts::varchar, '"},
        {"@type": "PropertyValue", "name": "Children Non-Core Counts", "value": "', children_non_core_counts::varchar, '"},
        {"@type": "PropertyValue", "name": "Total Historical Releases", "value": "', m.releases_count::varchar, '"}
    ]
},
{
    "@type": "FAQPage",
    "@id": "https://pypimap.com/package/', normalized_name, '#faq",
    "mainEntity": [
        {
            "@type": "Question",
            "name": "What are the dependencies of ', package_name, '?",
            "acceptedAnswer": {
                "@type": "Answer",
                "text": "', package_name, ' requires ', children_core_counts::varchar, ' core dependencies and ', children_non_core_counts::varchar, ' non-core dependencies to function correctly within software environments."
            }
        },
        {
            "@type": "Question",
            "name": "How many packages depend on ', package_name, '?",
            "acceptedAnswer": {
                "@type": "Answer",
                "text": "There are ', parent_core_counts::varchar, ' core upstream packages and ', parent_non_core_counts::varchar, ' non-core packages that depend on ', package_name, ' within the PyPI package registry ecosystem."
            }
        },
        {
        "@type": "Question",
        "name": "When was ', package_name, ' last release?",
        "acceptedAnswer": {
            "@type": "Answer",
            "text": "', package_name, ' last release on ', to_char(last_upload_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), ' ."
        }
    }
    ]
}
]
}
</script>') seo_header
from pypi.metadata_staging m join pypi.package_connections_staging p using(id)
where is_active_package and last_upload_date >= CURRENT_DATE - 1
on conflict (normalized_name) do update set seo_header = excluded.seo_header;