import 'package:flutter/material.dart';

import '../data/admin_repo.dart';
import '../data/models.dart';

/// Website admin forms ka mobile mirror (BROWSE / FastTrackManager /
/// AdminDraftEditor — same fields, same save/publish writes).

// ---------------- SHARED ----------------

class AdminTextField extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final int maxLines;
  final String hint;
  final bool readOnly;
  const AdminTextField({
    super.key,
    required this.label,
    required this.controller,
    this.maxLines = 1,
    this.hint = '',
    this.readOnly = false,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 4),
          TextField(
            controller: controller,
            maxLines: maxLines,
            readOnly: readOnly,
            decoration: InputDecoration(
              hintText: hint.isEmpty ? null : hint,
              border: const OutlineInputBorder(
                borderRadius: BorderRadius.all(Radius.circular(12)),
              ),
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 12,
                vertical: 10,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class AdminSection extends StatelessWidget {
  final String title;
  final List<Widget> children;
  const AdminSection({super.key, required this.title, required this.children});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.bold,
                color: Theme.of(context).colorScheme.primary,
              ),
            ),
            const SizedBox(height: 10),
            ...children,
          ],
        ),
      ),
    );
  }
}

// ---------------- JOB EDITOR ----------------

/// Job form — draft (job_drafts) ya live (jobs). Website BROWSE mirror.
class JobEditScreen extends StatefulWidget {
  final Map<String, dynamic> doc;
  final bool isDraft;
  const JobEditScreen({super.key, required this.doc, required this.isDraft});

  static const labels = {
    'title': 'Title *',
    'organization': 'Organization',
    'vacancies': 'Total Vacancies',
    'location': 'Job Location',
    'advtNo': 'Advertisement No.',
    'startDate': 'Application Start Date',
    'lastDate': 'Last Date',
    'qualification': 'Qualification',
    'ageLimit': 'Age Limit',
    'minAge': 'Min Age',
    'salary': 'Salary / Pay Scale',
    'applyLink': 'Apply Online URL',
    'category': 'Category',
    'description': 'Short Description',
    'articleHtml': 'Full Description (HTML)',
    'officialSiteLink': 'Official Website URL',
    'applicationFee': 'Application Fee',
    'selectionProcess': 'Selection Process',
    'eligibility': 'Eligibility',
    'notificationLink': 'Notification PDF URL',
    'feeGen': 'Fee — General (sirf number)',
    'feeOBC': 'Fee — OBC (sirf number)',
    'feeSCST': 'Fee — SC/ST (sirf number)',
    'feeFemale': 'Fee — Female (sirf number)',
    'price': 'Price',
    'imageUrl': 'Image URL',
  };

  static const sections = {
    'Basic': ['title', 'organization', 'category', 'advtNo'],
    'Dates': ['startDate', 'lastDate'],
    'Job Info': [
      'vacancies',
      'salary',
      'qualification',
      'ageLimit',
      'minAge',
      'location',
      'eligibility',
      'selectionProcess',
    ],
    'Fees': ['feeGen', 'feeOBC', 'feeSCST', 'feeFemale', 'applicationFee'],
    'Links': ['applyLink', 'notificationLink', 'officialSiteLink', 'imageUrl', 'price'],
    'Content': ['description', 'articleHtml'],
  };

  static const multiline = {
    'description': 3,
    'articleHtml': 10,
    'eligibility': 3,
    'selectionProcess': 3,
  };

  @override
  State<JobEditScreen> createState() => _JobEditScreenState();
}

class _JobEditScreenState extends State<JobEditScreen> {
  final _c = <String, TextEditingController>{};
  bool _busy = false;

  String get _id => str(widget.doc['id']);
  String get _type {
    final t = str(widget.doc['type']);
    return t.isNotEmpty ? t : 'JOB';
  }

  @override
  void initState() {
    super.initState();
    for (final k in JobEditScreen.labels.keys) {
      var v = str(widget.doc[k]);
      if (k == 'location' && v.isEmpty) v = 'All India';
      if (k == 'minAge' && v.isEmpty) v = '18';
      if (k == 'category' && v.isEmpty) v = 'ssc';
      _c[k] = TextEditingController(text: v);
    }
  }

  @override
  void dispose() {
    for (final c in _c.values) {
      c.dispose();
    }
    super.dispose();
  }

  Map<String, dynamic> _clean() {
    final title = _c['title']!.text;
    return {
      for (final k in JobEditScreen.labels.keys) k: _c[k]!.text,
      'type': _type,
      'slug': createSlug(title),
      'isLive': true,
      'updatedAt': DateTime.now().toIso8601String(),
    };
  }

  Future<void> _saveDraft() async {
    if (_c['title']!.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Title zaroori hai!')),
      );
      return;
    }
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await AdminRepo.updateJobDraft(_id, {
        ..._clean(),
        'updatedAt': DateTime.now().toIso8601String(),
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      messenger.showSnackBar(SnackBar(content: Text('Save fail: $e')));
      return;
    }
    if (!mounted) return;
    Navigator.of(context).pop();
    messenger.showSnackBar(
      const SnackBar(content: Text('Draft save ho gaya!')),
    );
  }

  Future<void> _publish() async {
    if (_c['title']!.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Title zaroori hai!')),
      );
      return;
    }
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await AdminRepo.publishJobDraft(_id, _clean());
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      messenger.showSnackBar(SnackBar(content: Text('Publish fail: $e')));
      return;
    }
    if (!mounted) return;
    Navigator.of(context).pop();
    messenger.showSnackBar(
      const SnackBar(content: Text('Job publish ho gayi!')),
    );
  }

  Future<void> _updateLive() async {
    if (_c['title']!.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Title zaroori hai!')),
      );
      return;
    }
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await AdminRepo.updateJob(_id, _clean());
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      messenger.showSnackBar(SnackBar(content: Text('Update fail: $e')));
      return;
    }
    if (!mounted) return;
    Navigator.of(context).pop();
    messenger.showSnackBar(
      const SnackBar(content: Text('Live post update ho gaya!')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.isDraft ? 'Review Job Draft' : 'Edit Job'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          for (final section in JobEditScreen.sections.entries)
            AdminSection(
              title: section.key,
              children: [
                for (final k in section.value)
                  AdminTextField(
                    label: JobEditScreen.labels[k]!,
                    controller: _c[k]!,
                    maxLines: JobEditScreen.multiline[k] ?? 1,
                  ),
              ],
            ),
          if (widget.isDraft) ...[
            FilledButton.icon(
              onPressed: _busy ? null : _publish,
              icon: const Icon(Icons.publish),
              label: Text(_busy ? 'Publishing...' : 'Publish (Live karo)'),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: _busy ? null : _saveDraft,
              icon: const Icon(Icons.save_outlined),
              label: const Text('Save Draft Only'),
            ),
          ] else
            FilledButton.icon(
              onPressed: _busy ? null : _updateLive,
              icon: const Icon(Icons.save),
              label: Text(_busy ? 'Saving...' : 'Update Live Post'),
            ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

// ---------------- FAST TRACK EDITOR ----------------

/// FT form — draft ya published. FastTrackManager mirror.
class FTEditScreen extends StatefulWidget {
  final Map<String, dynamic> doc;
  const FTEditScreen({super.key, required this.doc});

  @override
  State<FTEditScreen> createState() => _FTEditScreenState();
}

class _FTEditScreenState extends State<FTEditScreen> {
  late TextEditingController _title;
  late TextEditingController _category;
  late TextEditingController _org;
  late TextEditingController _updateDate;
  late TextEditingController _shortInfo;
  late TextEditingController _articleHtml;
  late TextEditingController _directLink;
  late String _status;
  bool _busy = false;

  String get _id => str(widget.doc['id']);
  bool get _isDraft => str(widget.doc['status']) != 'published';

  @override
  void initState() {
    super.initState();
    final d = widget.doc;
    _title = TextEditingController(text: str(d['title']));
    final cat = str(d['category']);
    _category = TextEditingController(text: cat.isEmpty ? 'Result' : cat);
    _org = TextEditingController(text: str(d['org']));
    _updateDate = TextEditingController(text: str(d['updateDate']));
    _shortInfo = TextEditingController(text: str(d['shortInfo']));
    _articleHtml = TextEditingController(text: str(d['articleHtml']));
    _directLink = TextEditingController(text: str(d['directLink']));
    _status = str(d['status']) == 'published' ? 'published' : 'draft';
  }

  @override
  void dispose() {
    _title.dispose();
    _category.dispose();
    _org.dispose();
    _updateDate.dispose();
    _shortInfo.dispose();
    _articleHtml.dispose();
    _directLink.dispose();
    super.dispose();
  }

  Map<String, dynamic> _values() => {
        'title': _title.text,
        'category': _category.text,
        'org': _org.text,
        'updateDate': _updateDate.text,
        'shortInfo': _shortInfo.text,
        'articleHtml': _articleHtml.text,
        'directLink': _directLink.text,
        'status': _status,
      };

  bool _valid() {
    if (_title.text.trim().isEmpty || _directLink.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Title aur Direct Link zaroori hain!')),
      );
      return false;
    }
    return true;
  }

  Future<void> _save() async {
    if (!_valid()) return;
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await AdminRepo.updateFT(_id, _values());
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      messenger.showSnackBar(SnackBar(content: Text('Save fail: $e')));
      return;
    }
    if (!mounted) return;
    Navigator.of(context).pop();
    messenger.showSnackBar(
      const SnackBar(content: Text('Update saved!')),
    );
  }

  Future<void> _approve() async {
    if (!_valid()) return;
    final yes = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Publish karein?'),
        content: Text('"${_title.text.trim()}"'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Rahne do'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Approve'),
          ),
        ],
      ),
    );
    if (yes != true || !mounted) return;
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await AdminRepo.updateFT(_id, _values());
      await AdminRepo.approveFT(_id);
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      messenger.showSnackBar(SnackBar(content: Text('Approve fail: $e')));
      return;
    }
    if (!mounted) return;
    Navigator.of(context).pop();
    messenger.showSnackBar(
      const SnackBar(content: Text('Published! Site + Telegram pe chala gaya.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Edit Fast Track')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          AdminSection(
            title: 'Update Info',
            children: [
              AdminTextField(label: 'Title *', controller: _title),
              AdminTextField(label: 'Category', controller: _category),
              AdminTextField(label: 'Organization', controller: _org),
              AdminTextField(label: 'Update Date', controller: _updateDate),
              AdminTextField(
                label: 'Direct Link URL *',
                controller: _directLink,
              ),
              const Text(
                'Status',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 4),
              DropdownButtonFormField<String>(
                value: _status,
                decoration: const InputDecoration(
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.all(Radius.circular(12)),
                  ),
                  contentPadding: EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 10,
                  ),
                ),
                items: const [
                  DropdownMenuItem(
                    value: 'draft',
                    child: Text('Draft'),
                  ),
                  DropdownMenuItem(
                    value: 'published',
                    child: Text('Published'),
                  ),
                ],
                onChanged: (v) => setState(() => _status = v ?? 'draft'),
              ),
              const SizedBox(height: 12),
            ],
          ),
          AdminSection(
            title: 'Content',
            children: [
              AdminTextField(
                label: 'Short Info',
                controller: _shortInfo,
                maxLines: 3,
              ),
              AdminTextField(
                label: 'Full Article (HTML)',
                controller: _articleHtml,
                maxLines: 10,
              ),
            ],
          ),
          if (_isDraft) ...[
            FilledButton.icon(
              onPressed: _busy ? null : _approve,
              icon: const Icon(Icons.check_circle),
              label: Text(_busy ? 'Publishing...' : 'Save + Approve (Publish)'),
            ),
            const SizedBox(height: 8),
          ],
          OutlinedButton.icon(
            onPressed: _busy ? null : _save,
            icon: const Icon(Icons.save_outlined),
            label: const Text('Save Only'),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

// ---------------- AI DRAFT EDITOR ----------------

class _QaRow {
  final TextEditingController q;
  final TextEditingController a;
  _QaRow(String q, String a)
      : q = TextEditingController(text: q),
        a = TextEditingController(text: a);
  void dispose() {
    q.dispose();
    a.dispose();
  }
}

class _LinkRow {
  final TextEditingController label;
  final TextEditingController url;
  _LinkRow(String label, String url)
      : label = TextEditingController(text: label),
        url = TextEditingController(text: url);
  void dispose() {
    label.dispose();
    url.dispose();
  }
}

/// AI article draft editor — AdminDraftEditor mirror (JOB 20 / FT 4 facts).
class AIEditScreen extends StatefulWidget {
  final AIDraft draft;
  const AIEditScreen({super.key, required this.draft});

  static const jobFacts = {
    'organization': 'Organization',
    'advtNo': 'Advertisement No.',
    'category': 'Category',
    'startDate': 'Application Start Date',
    'lastDate': 'Last Date',
    'examDate': 'Exam Date',
    'vacancies': 'Total Vacancies',
    'salary': 'Salary / Pay Scale',
    'qualification': 'Qualification',
    'ageLimit': 'Age Limit',
    'location': 'Job Location',
    'eligibility': 'Eligibility',
    'selectionProcess': 'Selection Process',
    'feeGen': 'Fee — General',
    'feeOBC': 'Fee — OBC',
    'feeSCST': 'Fee — SC/ST',
    'feeFemale': 'Fee — Female',
    'applyLink': 'Apply Online URL',
    'notificationLink': 'Notification PDF URL',
    'officialSiteLink': 'Official Website URL',
  };

  static const ftFacts = {
    'category': 'Category (Result/Admit Card/...)',
    'org': 'Organization',
    'updateDate': 'Update Date',
    'directLink': 'Direct Link URL',
  };

  @override
  State<AIEditScreen> createState() => _AIEditScreenState();
}

class _AIEditScreenState extends State<AIEditScreen> {
  late TextEditingController _title;
  late TextEditingController _slug;
  late TextEditingController _seoTitle;
  late TextEditingController _meta;
  late TextEditingController _short;
  late TextEditingController _articleHtml;
  late TextEditingController _keywords;
  final _facts = <String, TextEditingController>{};
  final _faqs = <_QaRow>[];
  final _links = <_LinkRow>[];
  bool _busy = false;

  bool get _isJob => widget.draft.type == 'JOB';
  Map<String, String> get _factDefs =>
      _isJob ? AIEditScreen.jobFacts : AIEditScreen.ftFacts;

  @override
  void initState() {
    super.initState();
    final m = widget.draft.raw;
    _title = TextEditingController(text: str(m['title']));
    _slug = TextEditingController(text: str(m['slug']));
    _seoTitle = TextEditingController(text: str(m['seoTitle']));
    _meta = TextEditingController(text: str(m['metaDescription']));
    _short = TextEditingController(text: str(m['shortDescription']));
    _articleHtml = TextEditingController(text: str(m['articleHtml']));
    final kw = m['keywords'];
    _keywords = TextEditingController(
      text: kw is List ? kw.map(str).where((e) => e.isNotEmpty).join(', ') : '',
    );
    final facts = asMap(m['facts']);
    for (final k in _factDefs.keys) {
      _facts[k] = TextEditingController(text: str(facts[k]));
    }
    final faqs = m['faqs'];
    if (faqs is List) {
      for (final f in faqs) {
        final fm = asMap(f);
        _faqs.add(_QaRow(str(fm['question']), str(fm['answer'])));
      }
    }
    final links = m['officialLinks'];
    if (links is List) {
      for (final l in links) {
        final lm = asMap(l);
        _links.add(_LinkRow(str(lm['label']), str(lm['url'])));
      }
    }
  }

  @override
  void dispose() {
    _title.dispose();
    _slug.dispose();
    _seoTitle.dispose();
    _meta.dispose();
    _short.dispose();
    _articleHtml.dispose();
    _keywords.dispose();
    for (final c in _facts.values) {
      c.dispose();
    }
    for (final r in _faqs) {
      r.dispose();
    }
    for (final r in _links) {
      r.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (_title.text.trim().isEmpty || _slug.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Title aur slug zaroori hain')),
      );
      return;
    }
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      final cleanFacts = Map<String, dynamic>.from(
        asMap(widget.draft.raw['facts']),
      );
      for (final k in _factDefs.keys) {
        final v = _facts[k]!.text.trim();
        if (v.isEmpty) {
          cleanFacts.remove(k);
        } else {
          cleanFacts[k] = v;
        }
      }
      await AdminRepo.updateAIDraft(widget.draft.id, {
        'title': _title.text.trim(),
        'slug': _slug.text.trim(),
        'seoTitle': _seoTitle.text.trim(),
        'metaDescription': _meta.text.trim(),
        'shortDescription': _short.text.trim(),
        'articleHtml': _articleHtml.text,
        'wordCount': wordCountOf(_articleHtml.text),
        'keywords':
            _keywords.text.split(',').map((k) => k.trim()).where((k) => k.isNotEmpty).toList(),
        'faqs': _faqs
            .where((f) =>
                f.q.text.trim().isNotEmpty && f.a.text.trim().isNotEmpty)
            .map((f) => {
                  'question': f.q.text.trim(),
                  'answer': f.a.text.trim(),
                })
            .toList(),
        'officialLinks': _links
            .where((l) =>
                l.label.text.trim().isNotEmpty &&
                RegExp(r'^https?://', caseSensitive: false)
                    .hasMatch(l.url.text.trim()))
            .map((l) => {
                  'label': l.label.text.trim(),
                  'url': l.url.text.trim(),
                })
            .toList(),
        'facts': cleanFacts,
        'draftEdited': true,
        'reviewStale': true,
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      messenger.showSnackBar(SnackBar(content: Text('Save fail: $e')));
      return;
    }
    if (!mounted) return;
    Navigator.of(context).pop();
    messenger.showSnackBar(
      const SnackBar(
        content: Text('Draft saved! Publish ke liye Admin Verified use karo'),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Review Draft ${_isJob ? 'Job' : 'Fast Track'}'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          AdminSection(
            title: 'Basic',
            children: [
              AdminTextField(label: 'Title *', controller: _title),
              AdminTextField(label: 'Slug *', controller: _slug),
              const Text(
                'Source URL',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 4),
              SelectableText(str(widget.draft.raw['sourceUrl'])),
              const SizedBox(height: 12),
            ],
          ),
          AdminSection(
            title: 'Facts',
            children: [
              for (final e in _factDefs.entries)
                AdminTextField(
                  label: e.value,
                  controller: _facts[e.key]!,
                ),
            ],
          ),
          AdminSection(
            title: 'SEO',
            children: [
              AdminTextField(label: 'SEO Title', controller: _seoTitle),
              AdminTextField(
                label: 'Meta Description',
                controller: _meta,
                maxLines: 2,
              ),
              AdminTextField(
                label: 'Short Description',
                controller: _short,
                maxLines: 2,
              ),
              AdminTextField(
                label: 'Keywords (comma separated)',
                controller: _keywords,
              ),
            ],
          ),
          AdminSection(
            title: 'Full Article (HTML)',
            children: [
              AdminTextField(
                label: 'articleHtml',
                controller: _articleHtml,
                maxLines: 12,
              ),
            ],
          ),
          AdminSection(
            title: 'FAQs (${_faqs.length})',
            children: [
              for (var i = 0; i < _faqs.length; i++) ...[
                Row(
                  children: [
                    Expanded(
                      child: AdminTextField(
                        label: 'Q${i + 1}',
                        controller: _faqs[i].q,
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.delete_outline, color: Colors.red),
                      onPressed: () => setState(() {
                        _faqs[i].dispose();
                        _faqs.removeAt(i);
                      }),
                    ),
                  ],
                ),
                AdminTextField(
                  label: 'A${i + 1}',
                  controller: _faqs[i].a,
                  maxLines: 2,
                ),
              ],
              OutlinedButton.icon(
                onPressed: () => setState(() => _faqs.add(_QaRow('', ''))),
                icon: const Icon(Icons.add),
                label: const Text('Add FAQ'),
              ),
              const SizedBox(height: 12),
            ],
          ),
          AdminSection(
            title: 'Official Links (${_links.length})',
            children: [
              for (var i = 0; i < _links.length; i++) ...[
                Row(
                  children: [
                    Expanded(
                      child: AdminTextField(
                        label: 'Label',
                        controller: _links[i].label,
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.delete_outline, color: Colors.red),
                      onPressed: () => setState(() {
                        _links[i].dispose();
                        _links.removeAt(i);
                      }),
                    ),
                  ],
                ),
                AdminTextField(
                  label: 'URL (https://...)',
                  controller: _links[i].url,
                ),
              ],
              OutlinedButton.icon(
                onPressed: () => setState(() => _links.add(_LinkRow('', ''))),
                icon: const Icon(Icons.add),
                label: const Text('Add Link'),
              ),
              const SizedBox(height: 12),
            ],
          ),
          FilledButton.icon(
            onPressed: _busy ? null : _save,
            icon: const Icon(Icons.save),
            label: Text(_busy ? 'Saving...' : 'Save Draft'),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}
