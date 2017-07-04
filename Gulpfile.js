const gulp = require('gulp')
const gulpBabel = require('gulp-babel')
const size = require('gulp-size')
const cache = require('gulp-cached')
const rollup = require('gulp-rollup')
const pkg = require('./package.json')
const path = require('path')
const sourcemaps = require('gulp-sourcemaps')
const rename = require('gulp-rename')
const plumber = require('gulp-plumber')
const connect = require('gulp-connect')
const gulpUglify = require('gulp-uglify')
const gulpDebug = require('gulp-debug')
const gulpESDoc = require('gulp-esdoc')

const rollupCJS = require('rollup-plugin-commonjs')
const rollupBabel = require('rollup-plugin-babel')
const rollupStrip = require('rollup-plugin-strip')
const rollupStripLogger = require('rollup-plugin-strip-logger')
const rollupJSON = require('rollup-plugin-json')
const rollupIgnore = require('rollup-plugin-ignore')
const rollupNR = require('rollup-plugin-node-resolve')

const SRC = './src'
const LIB = './lib'
const DIST = './dist'
const DOCS = './docs'

const ALL_FILES = '**/*.js'
const BROWSER_ENTRYPOINT = 'browser.js'
const README = 'README.md'

const ESDocConfig = require('./.esdoc.json')

gulp.task('build:forNode', () =>
	gulp.src(path.join(SRC, ALL_FILES))
		.pipe(plumber())
		.pipe(cache('build:forNode'))
		.pipe(gulpBabel({
			plugins: [
				"inline-package-json",
				[
					"transform-es2015-modules-commonjs",
					{
						"allowTopLevelThis": true
					}
				]
			]
		}))
		.pipe(gulp.dest(LIB))
		.pipe(size({
			title: 'build:forNode',
			showFiles: true
		}))
)

gulp.task('rebuild:forNode', ['build:forNode'], () =>
	gulp.watch(path.join(SRC, ALL_FILES), ['build:forNode']))

gulp.task('build:forBrowser', () =>
	gulp.src([path.join(SRC, ALL_FILES), './package.json'])
		.pipe(gulpDebug({title: "build:forBrowser"}))
		.pipe(plumber())
		.pipe(sourcemaps.init({}))
		.pipe(rollup({
			entry: path.join(SRC, BROWSER_ENTRYPOINT),
			sourceMap: true,
			format: 'iife',
			moduleName: 'MIDI',
			plugins: [
				rollupJSON(),
				rollupIgnore(['debug']),
				rollupNR(),
				rollupBabel({
					plugins: [
						"external-helpers"
					]
				}),
				rollupStrip({
					functions: [
						'debug'
					]
				}),
				rollupStripLogger({
					variableName: 'debug',
					propertyName: 'Debug',
					packageName: 'debug'
				})
			]
		}))
		.pipe(rename('MIDI.js'))
		// .pipe(gulpUglify())
		.pipe(sourcemaps.write('.'))
		.pipe(gulp.dest(DIST))
		.pipe(size({
			title: 'build:forBrowser',
			showFiles: true
		}))
		.pipe(connect.reload())
)

gulp.task('rebuild:forBrowser', ['build:forBrowser'], () =>
	gulp.watch(path.join(SRC, ALL_FILES), ['build:forBrowser']))

gulp.task('build:docs', done =>
	gulp.src([path.join(SRC, ALL_FILES), README]).pipe(gulpESDoc(ESDocConfig)))

gulp.task('rebuild:docs', ['build:docs'], () =>
	gulp.watch(path.join(SRC, ALL_FILES), ['build:docs']))

gulp.task('build', ['build:forNode', 'build:forBrowser'])
gulp.task('rebuild', ['rebuild:forNode', 'rebuild:forBrowser'])

gulp.task('devserver', ['rebuild:forBrowser'], () => connect.server({
	root: '.',
	port: 5434,
	name: 'devserver',
	livereload: true
}))