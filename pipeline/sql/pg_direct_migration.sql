insert into pypi.seo_cache_stage (normalized_name, seo_header, is_active_package)
with source as (
    select
        m.*
        ,p.parent_core_counts
        ,p.parent_non_core_counts
        ,p.children_core_counts
        ,p.children_non_core_counts
        ,case when char_length(m.package_name) > 22
            then left(m.package_name, 12) || '...' || right(m.package_name, 7)
            else m.package_name end                                                 title_name
        ,case when char_length(m.package_name) > 30
            then left(m.package_name, 17) || '...' || right(m.package_name, 10)
            else m.package_name end                                                 display_name
    from pypi.metadata_stage m
    join pypi.package_connections_stage p using (id)
    where m.is_active_package
),
prepared as (
    select
        *,
        replace(replace(replace(replace(replace(title_name,
            '&', '&amp;'), '"', '&quot;'), '<', '&lt;'), '>', '&gt;'), '''', '&#39;') html_title_name,
        replace(replace(replace(replace(replace(display_name,
            '&', '&amp;'), '"', '&quot;'), '<', '&lt;'), '>', '&gt;'), '''', '&#39;') html_display_name,
        replace(replace(replace(replace(replace(left(last_version, 8),
            '&', '&amp;'), '"', '&quot;'), '<', '&lt;'), '>', '&gt;'), '''', '&#39;') html_version
    from source
),
rendered as (
    select
        normalized_name,
        is_active_package,
        concat(
            '<title>', html_title_name, ' v', html_version, ' Dependency Graph | PyPIMap</title>
<meta name="description" content="Analyze ', html_display_name, ' (v', html_version, ') with ', releases_count::varchar, ' releases. Structural metrics: ', parent_core_counts::varchar, ' core dependents, ', children_core_counts::varchar, ' core dependencies. View full interactive network graph map." />
<link rel="canonical" href="https://pypimap.com/package/', normalized_name, '" />
<meta property="og:type" content="website" />
<meta property="og:title" content="', html_display_name, ' Ecosystem Map & Graph Analytics" />
<meta property="og:description" content="Interactive network visualization for ', html_display_name, '. Explore ', releases_count::varchar, ' versions, upload history, and core dependency vectors." />
<meta property="og:url" content="https://pypimap.com/package/', normalized_name, '" />
<meta property="og:site_name" content="PyPiMap" />
<meta property="og:image" content="https://pypimap.com/assets/og-preview.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="', html_display_name, ' Ecosystem Map" />
<meta name="twitter:description" content="Explore upstream and downstream dependencies for ', html_display_name, ' visually." />
<meta name="twitter:image" content="https://pypimap.com/assets/og-preview.png" />
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-R10LEPYJJE"></script>
<script>
window.dataLayer = window.dataLayer || []
function gtag(){dataLayer.push(arguments)}
gtag(''js'', new Date())
gtag(''config'', ''G-R10LEPYJJE'')
</script>
<script type="application/ld+json">',
            jsonb_build_object(
                '@context', 'https://schema.org',
                '@graph', jsonb_build_array(
                    jsonb_build_object(
                        '@type', 'Person',
                        '@id', 'https://naelaqel.com/#person',
                        'name', 'Nael Aqel',
                        'url', 'https://naelaqel.com',
                        'sameAs', jsonb_build_array(
                            'https://www.linkedin.com/in/naelaqel1',
                            'https://github.com/naelaqel',
                            'https://www.kaggle.com/naelaqel',
                            'https://linktr.ee/naelaqel',
                            'https://www.reddit.com/user/naelaqel',
                            'https://www.quora.com/profile/Naelaqel',
                            'https://medium.com/@naelaqel',
                            'https://www.upwork.com/freelancers/naelaqel',
                            'https://public.tableau.com/app/profile/nael.aqel'
                        )
                    ),
                    jsonb_build_object(
                        '@type', 'WebApplication',
                        '@id', 'https://pypimap.com/#website',
                        'name', 'PyPiMap',
                        'url', 'https://pypimap.com',
                        'description', 'Interactive data platform analyzing the Python package dependency ecosystem maps.',
                        'applicationCategory', 'DeveloperApplication',
                        'operatingSystem', 'All',
                        'creator', jsonb_build_object('@id', 'https://naelaqel.com/#person'),
                        'publisher', jsonb_build_object('@id', 'https://naelaqel.com/#person'),
                        'maintainer', jsonb_build_object('@id', 'https://naelaqel.com/#person'),
                        'codeRepository', 'https://github.com/naelaqel/pypimap',
                        'license', 'https://opensource.org/licenses/MIT',
                        'isBasedOn', jsonb_build_array(
                            jsonb_build_object(
                                '@type', 'Dataset',
                                'name', 'PyPI Simple API Registry Metadata',
                                'description', 'Upstream package dependency metadata extracted via the official Python Packaging Authority (PyPA) Simple API endpoints.',
                                'url', 'https://pypi.org/simple/'
                            ),
                            jsonb_build_object(
                                '@type', 'Dataset',
                                'name', 'PyPI Stats Download Metrics',
                                'description', 'Aggregate download statistics, installation velocity records, and package usage logs sourced from PyPI Stats.',
                                'url', 'https://pypistats.org/'
                            )
                        ),
                        'hasPart', jsonb_build_object(
                            '@type', 'Dataset',
                            'name', 'PyPI Daily Package Profiles & Analytics Graph',
                            'description', 'Pre-vectorized pipeline node snapshots optimized for Graph Neural Networks and dependency analysis.',
                            'url', 'https://www.kaggle.com/datasets/naelaqel/pypi-daily-metadata-and-analytics-base-dataset/data',
                            'license', 'https://creativecommons.org/licenses/by/4.0/',
                            'creator', jsonb_build_object('@type', 'Person', 'name', 'Nael Aqel')
                        )
                    ),
                    jsonb_strip_nulls(jsonb_build_object(
                        '@type', 'SoftwareSourceCode',
                        '@id', 'https://pypimap.com/package/' || normalized_name || '#software',
                        'name', package_name,
                        'identifier', normalized_name,
                        'operatingSystem', 'Cross-platform',
                        'applicationCategory', 'DeveloperApplication',
                        'softwareVersion', last_version,
                        'description', concat('Analyze ', display_name, ' (v', left(last_version, 8), ') with ', releases_count, ' releases. Structural metrics: ', parent_core_counts, ' core dependents, ', children_core_counts, ' core dependencies.'),
                        'url', 'https://pypimap.com/package/' || normalized_name,
                        'downloadUrl', nullif(home_page, ''),
                        'dateCreated', to_char(first_upload_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                        'dateModified', to_char(last_upload_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                        'author', jsonb_build_object('@type', 'Person', 'name', coalesce(author, 'Unknown'))
                    )),
                    jsonb_build_object(
                        '@type', 'ItemPage',
                        '@id', 'https://pypimap.com/package/' || normalized_name,
                        'url', 'https://pypimap.com/package/' || normalized_name,
                        'name', package_name || ' Interactivity Map & Analysis Page',
                        'mainEntity', jsonb_build_object('@id', 'https://pypimap.com/package/' || normalized_name || '#software'),
                        'about', jsonb_build_array(
                            jsonb_build_object('@type', 'PropertyValue', 'name', 'Parent Core Counts', 'value', parent_core_counts::text),
                            jsonb_build_object('@type', 'PropertyValue', 'name', 'Parent Non-Core Counts', 'value', parent_non_core_counts::text),
                            jsonb_build_object('@type', 'PropertyValue', 'name', 'Children Core Counts', 'value', children_core_counts::text),
                            jsonb_build_object('@type', 'PropertyValue', 'name', 'Children Non-Core Counts', 'value', children_non_core_counts::text),
                            jsonb_build_object('@type', 'PropertyValue', 'name', 'Total Historical Releases', 'value', releases_count::text)
                        )
                    ),
                    jsonb_build_object(
                        '@type', 'FAQPage',
                        '@id', 'https://pypimap.com/package/' || normalized_name || '#faq',
                        'mainEntity', jsonb_build_array(
                            jsonb_build_object(
                                '@type', 'Question',
                                'name', 'What are the dependencies of ' || package_name || '?',
                                'acceptedAnswer', jsonb_build_object(
                                    '@type', 'Answer',
                                    'text', concat(package_name, ' requires ', children_core_counts, ' core dependencies and ', children_non_core_counts, ' non-core dependencies to function correctly within software environments.')
                                )
                            ),
                            jsonb_build_object(
                                '@type', 'Question',
                                'name', 'How many packages depend on ' || package_name || '?',
                                'acceptedAnswer', jsonb_build_object(
                                    '@type', 'Answer',
                                    'text', concat('There are ', parent_core_counts, ' core upstream packages and ', parent_non_core_counts, ' non-core packages that depend on ', package_name, ' within the PyPI package registry ecosystem.')
                                )
                            ),
                            jsonb_build_object(
                                '@type', 'Question',
                                'name', 'When was ' || package_name || ' last release?',
                                'acceptedAnswer', jsonb_build_object(
                                    '@type', 'Answer',
                                    'text', concat(package_name, ' last release on ', to_char(last_upload_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), ' .')
                                )
                            )
                        )
                    )
                )
            )::text,
            '</script>'
        ) seo_header
    from prepared
)
select normalized_name, seo_header, is_active_package
from rendered;


-- create indices 
create index if not exists idx_indecies_stage_normalized_name on pypi.indecies_stage using gin(normalized_name gin_trgm_ops);
create index if not exists idx_metadata_cdc_stage_package_name on pypi.metadata_cdc_stage using gin(package_name gin_trgm_ops);
create index if not exists idx_metadata_cdc_stage_normalized_name on pypi.metadata_cdc_stage using gin(normalized_name gin_trgm_ops);
create index if not exists idx_metadata_cdc_stage_author_trgm on pypi.metadata_cdc_stage using gin(author gin_trgm_ops);
create index if not exists idx_metadata_cdc_stage_version_trgm on pypi.metadata_cdc_stage using gin(version gin_trgm_ops);
create index if not exists idx_metadata_cdc_stage_latest on pypi.metadata_cdc_stage(normalized_name, upload_date desc, inserted_at desc);
create index if not exists idx_metadata_cdc_stage_id on pypi.metadata_cdc_stage(id);
create index if not exists idx_metadata_stage_package_name on pypi.metadata_stage using gin(package_name gin_trgm_ops);
create index if not exists idx_metadata_stage_normalized_name on pypi.metadata_stage using gin(normalized_name gin_trgm_ops);
create index if not exists idx_metadata_stage_author_trgm on pypi.metadata_stage using gin(author gin_trgm_ops);
create index if not exists idx_metadata_stage_importance_score on pypi.metadata_stage(importance_score desc);
create index if not exists idx_metadata_stage_releases_count on pypi.metadata_stage(releases_count desc);
create index if not exists idx_seo_cache_stage_normalized_name on pypi.seo_cache_stage using gin(normalized_name gin_trgm_ops);


-- from staging to production
drop table if exists pypi.indecies;
alter table pypi.indecies_stage rename to indecies;
drop table if exists pypi.metadata_cdc;
alter table pypi.metadata_cdc_stage rename to metadata_cdc;
drop table if exists pypi.metadata;
alter table pypi.metadata_stage rename to metadata;
drop table if exists pypi.package_connections;
alter table pypi.package_connections_stage rename to package_connections;
drop table if exists pypi.seo_cache;
alter table pypi.seo_cache_stage rename to seo_cache;


-- run analyze to update statistics
analyze pypi.indecies;
analyze pypi.metadata_cdc;
analyze pypi.metadata;
analyze pypi.package_connections;
analyze pypi.seo_cache;
