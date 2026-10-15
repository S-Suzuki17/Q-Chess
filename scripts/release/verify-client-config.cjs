const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function inspectJavaScript(source, file = 'client.js') {
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    assert.equal(ast.parseDiagnostics.length, 0, 'Cannot inspect exported JavaScript: ' + file);
    const unresolved = new Set(), literals = new Set();
    const isEnv = node => ts.isPropertyAccessExpression(node) && node.name.text === 'env'
        || ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression) && node.argumentExpression.text === 'env';
    const visit = node => {
        if (ts.isStringLiteralLike(node)) literals.add(node.text);
        if (ts.isPropertyAccessExpression(node) && isEnv(node.expression) && node.name.text.startsWith('NEXT_PUBLIC_')) unresolved.add(node.name.text);
        if (ts.isElementAccessExpression(node) && isEnv(node.expression) && ts.isStringLiteral(node.argumentExpression)
            && node.argumentExpression.text.startsWith('NEXT_PUBLIC_')) unresolved.add(node.argumentExpression.text);
        ts.forEachChild(node, visit);
    };
    visit(ast);
    return { unresolved: [...unresolved].sort(), literals };
}
function verifyClientBuild(directory, expected) {
    const root = path.resolve(directory), files = [];
    const walk = dir => {
        for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, item.name);
            if (item.isDirectory()) walk(full);
            else if (item.isFile() && item.name.endsWith('.js')) files.push(full);
        }
    };
    assert.ok(fs.existsSync(path.join(root, '_next/static')), 'Exported client assets are missing');
    walk(path.join(root, '_next/static'));
    assert.ok(files.length, 'Exported client JavaScript is missing');
    const required = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SERVER_URL'];
    for (const name of required) assert.ok(typeof expected[name] === 'string' && expected[name].length, 'Missing expected public setting: ' + name);
    const found = new Set();
    for (const file of files) {
        const relative = path.relative(root, file);
        const result = inspectJavaScript(fs.readFileSync(file, 'utf8'), relative);
        assert.equal(result.unresolved.length, 0, 'Unresolved public configuration in ' + relative + ': ' + result.unresolved.join(', '));
        for (const name of required) if (result.literals.has(expected[name])) found.add(name);
    }
    for (const name of required) assert.ok(found.has(name), 'Expected public setting is absent from exported JavaScript: ' + name);
    return { javascriptFiles: files.length, publicSettingsVerified: required, unresolvedPublicReads: 0 };
}
module.exports = { inspectJavaScript, verifyClientBuild };
if (require.main === module) {
    const result = verifyClientBuild(process.argv[2] || 'out', process.env);
    console.log(JSON.stringify(result));
}
