const fs = require('fs');
const path = require('path');

const menuItemTemplate = path.join(
  __dirname, '..', 'node_modules', 'hexo-theme-next',
  'layout', '_partials', 'header', 'menu-item.njk'
);

const patched = `{% macro render(node) %}

  {%- set itemURL = node.path %}
  <li class="menu-item menu-item-{{ node.name | lower | replace(' ', '-') }}{% if node.children.length > 0 %} menu-item-has-children{% endif %}">

    {%- set menuIcon = '<i class="' + node.icon + ' fa-fw"></i>' if theme.menu_settings.icons and node.icon else '' %}
    {%- set menuText = __('menu.' + node.name) | replace('menu.', '') %}

    {%- set menuBadge = '' %}
    {%- if theme.menu_settings.badges %}
      {%- set badges = {
        archives  : site.posts.length,
        categories: site.categories.length,
        tags      : site.tags.length
        }
      %}
      {%- for menu, count in badges %}
        {%- if node.name == menu %}
          {%- set menuBadge = '<span class="badge">' + count + '</span>' %}
        {%- endif %}
      {%- endfor %}
    {%- endif %}

    {{- next_url(itemURL, menuIcon + menuText + menuBadge, {rel: 'section'}) -}}

    {%- if node.children.length > 0 %}
      <ul class="sub-menu">
        {%- for child in node.children %}
          {{ render(child) }}
        {%- endfor %}
      </ul>
    {%- endif %}

  </li>

{% endmacro %}
`;

fs.writeFileSync(menuItemTemplate, patched, 'utf8');
