update pypi.metadata m
set importance_score = p.used_by_core_counts + 0.3*p.used_by_optional_counts
    ,updated_at = now()
from pypi.package_connections p
where m.id = p.id
    and m.importance_score is distinct from
        p.used_by_core_counts + 0.3*p.used_by_optional_counts;


-- run analyze to update statistics
analyze pypi.indecies;
analyze pypi.metadata_cdc;
analyze pypi.metadata;
analyze pypi.package_connections;
